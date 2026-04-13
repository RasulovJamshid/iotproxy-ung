import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { encode as base58Encode } from 'bs58';
import { Redis } from 'ioredis';
import { ApiKey } from './api-key.entity';
import { ApiKeyScope } from './api-key-scope.entity';

const CACHE_TTL = 60;       // seconds
const CACHE_PREFIX = 'apikey:';
const BCRYPT_ROUNDS = 10;

export interface ScopeEntry {
  orgId: string;
  siteId?: string;
}

export interface GenerateKeyOptions {
  /** GLOBAL = all orgs/sites | ORGS = listed orgs | SITES = specific sites */
  scopeType?: string;
  /** Scope rows to insert. Omit for GLOBAL. */
  scopes?: ScopeEntry[];
  /** Legacy single-site (used when scopeType omitted / 'SITES' with no scopes array) */
  siteId?: string;
  permissions: string[];
  websocketEnabled?: boolean;
  expiresAt?: Date;
  name: string;
}

@Injectable()
export class ApiKeyService {
  constructor(
    @InjectRepository(ApiKey) private repo: Repository<ApiKey>,
    @InjectRepository(ApiKeyScope) private scopeRepo: Repository<ApiKeyScope>,
    @Inject('CACHE_REDIS') private redis: Redis,
    private dataSource: DataSource,
  ) {}

  // ── Key generation ───────────────────────────────────────────────────────

  async generate(
    organizationId: string,
    opts: GenerateKeyOptions,
  ): Promise<{ key: string; apiKey: ApiKey }> {
    const raw = 'iot_' + base58Encode(randomBytes(32));
    const hash = await bcrypt.hash(raw, BCRYPT_ROUNDS);
    const prefix = raw.slice(0, 12);

    const scopeType = opts.scopeType ?? 'SITES';

    const apiKey = await this.dataSource.transaction(async (em) => {
      const key = em.getRepository(ApiKey).create({
        keyHash: hash,
        prefix,
        organizationId,
        siteId: opts.siteId,
        scopeType,
        permissions: opts.permissions,
        websocketEnabled: opts.websocketEnabled ?? true,
        expiresAt: opts.expiresAt,
        name: opts.name,
      });
      await em.getRepository(ApiKey).save(key);

      if (scopeType !== 'GLOBAL' && opts.scopes?.length) {
        const rows = opts.scopes.map((s) =>
          em.getRepository(ApiKeyScope).create({ apiKeyId: key.id, orgId: s.orgId, siteId: s.siteId }),
        );
        await em.getRepository(ApiKeyScope).save(rows);
        key.scopes = opts.scopes;
      }

      return key;
    });

    return { key: raw, apiKey };
  }

  // ── Validation (cache-first, always bcrypt-verifies) ─────────────────────

  async validate(rawKey: string): Promise<ApiKey | null> {
    const prefix = rawKey.slice(0, 12);
    const cacheKey = CACHE_PREFIX + prefix;
    const cached = await this.redis.get(cacheKey);

    if (cached === 'invalid') return null;

    if (cached) {
      const parsed = JSON.parse(cached) as { hash: string; scopes?: ScopeEntry[] } & Partial<ApiKey>;
      const valid = await bcrypt.compare(rawKey, parsed.hash);
      if (!valid) return null;
      const { hash: _, ...metadata } = parsed;
      return metadata as ApiKey;
    }

    // Cache miss — query DB
    const candidates = await this.repo.find({ where: { prefix } });

    for (const candidate of candidates) {
      if (!(await bcrypt.compare(rawKey, candidate.keyHash))) continue;

      if (!candidate.isActive) {
        await this.cacheInvalid(cacheKey);
        return null;
      }

      // Load scopes and attach
      if (candidate.scopeType !== 'GLOBAL') {
        const scopeRows = await this.scopeRepo.find({ where: { apiKeyId: candidate.id } });
        candidate.scopes = scopeRows.map((r) => ({ orgId: r.orgId, siteId: r.siteId }));
      }

      await this.cacheValid(cacheKey, candidate);
      void this.repo.update(candidate.id, { lastUsedAt: new Date() });
      return candidate;
    }

    await this.cacheInvalid(cacheKey);
    return null;
  }

  // ── Update ───────────────────────────────────────────────────────────────

  async update(
    id: string,
    organizationId: string,
    data: Partial<Pick<ApiKey, 'name' | 'permissions' | 'expiresAt' | 'websocketEnabled'>>,
  ): Promise<ApiKey> {
    const key = await this.repo.findOne({ where: { id, organizationId } });
    if (!key) throw new NotFoundException('API key not found');
    await this.repo.update(id, data);
    await this.cacheInvalid(CACHE_PREFIX + key.prefix);
    return this.repo.findOne({ where: { id } }) as Promise<ApiKey>;
  }

  // ── Revocation ───────────────────────────────────────────────────────────

  async revoke(id: string, organizationId: string): Promise<void> {
    const key = await this.repo.findOne({ where: { id, organizationId } });
    if (!key) throw new NotFoundException('API key not found');
    await this.repo.update(id, { revokedAt: new Date() });
    await this.redis.setex(CACHE_PREFIX + key.prefix, 300, 'invalid');
  }

  // ── Hard delete ──────────────────────────────────────────────────────────

  async deleteKey(id: string, organizationId: string): Promise<void> {
    const key = await this.repo.findOne({ where: { id, organizationId } });
    if (!key) throw new NotFoundException('API key not found');
    await this.redis.setex(CACHE_PREFIX + key.prefix, 300, 'invalid');
    await this.repo.delete(id);
  }

  async findByOrg(organizationId: string): Promise<ApiKey[]> {
    const keys = await this.repo.find({ where: { organizationId } });
    if (!keys.length) return keys;

    // Load scopes for all keys in one query
    const keyIds = keys.map((k) => k.id);
    const allScopes = await this.scopeRepo
      .createQueryBuilder('s')
      .where('s.apiKeyId IN (:...ids)', { ids: keyIds })
      .getMany();

    const scopeMap = new Map<string, ScopeEntry[]>();
    for (const s of allScopes) {
      const list = scopeMap.get(s.apiKeyId) ?? [];
      list.push({ orgId: s.orgId, siteId: s.siteId });
      scopeMap.set(s.apiKeyId, list);
    }

    for (const key of keys) {
      key.scopes = scopeMap.get(key.id) ?? [];
    }

    return keys;
  }

  async findOne(id: string): Promise<ApiKey | null> {
    return this.repo.findOne({ where: { id } });
  }

  // ── Used by KeyExpiryCron ─────────────────────────────────────────────────

  async markExpired(keys: ApiKey[]): Promise<void> {
    for (const key of keys) {
      await this.repo.update(key.id, { revokedAt: new Date() });
      await this.cacheInvalid(CACHE_PREFIX + key.prefix);
    }
  }

  async markWarningSent(id: string): Promise<void> {
    await this.repo.update(id, { expiryWarningSentAt: new Date() });
  }

  async findExpired(): Promise<ApiKey[]> {
    return this.repo
      .createQueryBuilder('k')
      .where('k.expires_at < NOW()')
      .andWhere('k.revoked_at IS NULL')
      .getMany();
  }

  async findExpiringSoon(): Promise<ApiKey[]> {
    return this.repo
      .createQueryBuilder('k')
      .where('k.expires_at BETWEEN NOW() AND NOW() + INTERVAL \'7 days\'')
      .andWhere('k.revoked_at IS NULL')
      .andWhere('k.expiry_warning_sent_at IS NULL')
      .getMany();
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async cacheValid(cacheKey: string, key: ApiKey): Promise<void> {
    const toCache = { hash: key.keyHash, ...key };
    await this.redis.setex(cacheKey, CACHE_TTL, JSON.stringify(toCache));
  }

  private async cacheInvalid(cacheKey: string): Promise<void> {
    await this.redis.setex(cacheKey, CACHE_TTL, 'invalid');
  }
}
