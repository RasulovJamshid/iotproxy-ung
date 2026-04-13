import {
  Injectable, OnModuleInit, OnModuleDestroy, Logger, Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as mqtt from 'mqtt';
import { Redis } from 'ioredis';
import { IngestQueueProducer } from './ingest-queue.producer';
import { Site } from '../sites/site.entity';
import { SiteAdapter } from '../adapters/site-adapter.entity';
import { normalizeInbound } from '../adapters/response-mapper';
import { IngestJob } from '@iotproxy/shared';
import { randomUUID } from 'crypto';

const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 600;          // messages/min per siteId
const ORG_CACHE_TTL = 300;       // seconds
const LEADER_KEY = 'mqtt:leader';
const LEADER_TTL = 10;           // seconds

@Injectable()
export class MqttIngestService implements OnModuleInit, OnModuleDestroy {
  private client!: mqtt.MqttClient;
  private leaderInterval!: NodeJS.Timeout;
  private isLeader = false;
  private readonly logger = new Logger(MqttIngestService.name);
  private readonly adapterCache = new Map<string, { adapter: SiteAdapter | null; expiresAt: number }>();
  private readonly ADAPTER_CACHE_TTL = 300_000; // 5 min

  constructor(
    private config: ConfigService,
    private queue: IngestQueueProducer,
    @Inject('CACHE_REDIS') private redis: Redis,
    @InjectRepository(Site) private sites: Repository<Site>,
    @InjectRepository(SiteAdapter) private adapters: Repository<SiteAdapter>,
  ) {}

  onModuleInit() {
    this.client = mqtt.connect(this.config.get<string>('mqtt.url')!, {
      clientId: `iotproxy-ingest-${this.config.get('podName')}-${randomUUID().slice(0, 6)}`,
      reconnectPeriod: 3000,
    });

    this.client.on('message', this.handleMessage.bind(this));
    this.client.on('error', (err) => this.logger.error('MQTT error', err));
    this.client.on('connect', () => this.logger.log('MQTT connected'));

    // Leader election — only one replica subscribes to prevent 3× enqueue
    this.tryBecomeLeader();
    this.leaderInterval = setInterval(() => this.tryBecomeLeader(), 5_000);
  }

  onModuleDestroy() {
    clearInterval(this.leaderInterval);
    this.client?.end();
  }

  // ── Leader election ──────────────────────────────────────────────────────

  private async tryBecomeLeader() {
    const podName = this.config.get<string>('podName') ?? 'local';
    const acquired = await this.redis.set(
      LEADER_KEY, podName, 'EX', LEADER_TTL, 'NX',
    );

    if (acquired === 'OK' && !this.isLeader) {
      this.isLeader = true;
      this.client.subscribe([
        'sites/+/readings',
        'sites/+/sensors/+/readings',
      ], (err) => {
        if (err) this.logger.error('MQTT subscribe failed', err);
        else this.logger.log(`Pod ${podName} is MQTT leader`);
      });
    } else if (acquired === 'OK' && this.isLeader) {
      // Renew lease
      await this.redis.expire(LEADER_KEY, LEADER_TTL);
    }
  }

  // ── Message handling ─────────────────────────────────────────────────────

  private async handleMessage(topic: string, payload: Buffer) {
    try {
      const parts = topic.split('/');
      const siteId = parts[1];

      if (!(await this.checkRateLimit(siteId))) {
        this.logger.warn(`Rate limit exceeded for site ${siteId}`);
        return;
      }

      const organizationId = await this.resolveOrg(siteId);
      if (!organizationId) {
        this.logger.warn(`Unknown siteId ${siteId} in MQTT topic ${topic}`);
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(payload.toString());
      } catch {
        this.logger.warn(`Invalid JSON on topic ${topic}`);
        return;
      }

      const rawItems = Array.isArray(parsed) ? parsed : [parsed];
      const items = rawItems.slice(0, 500) as Array<Record<string, unknown>>;

      const batchId = randomUUID();
      const adapter = await this.resolveAdapter(siteId);
      let jobs: IngestJob[];

      if (adapter?.inboundEnabled && adapter.inboundMapping) {
        const mapped = normalizeInbound(items, adapter.inboundMapping, siteId);
        jobs = mapped.map((r) => ({
          sensorId: r.sensorId,
          phenomenonTime: r.phenomenonTime,
          data: r.data,
          organizationId,
          siteId,
          receivedAt: new Date().toISOString(),
          correlationId: randomUUID(),
          batchId,
          source: 'mqtt' as const,
        }));
      } else {
        jobs = items.map((r) => ({
          sensorId: r['sensorId'] as string,
          phenomenonTime: r['phenomenonTime'] as string,
          data: r['data'] as Record<string, unknown> ?? r,
          organizationId,
          siteId,
          receivedAt: new Date().toISOString(),
          correlationId: randomUUID(),
          batchId,
          source: 'mqtt' as const,
        }));
      }

      await this.queue.enqueue(jobs);
    } catch (err) {
      this.logger.error(`Failed to process MQTT message on ${topic}`, err);
    }
  }

  // ── Rate limiting (sliding window via Redis sorted set) ──────────────────

  private async checkRateLimit(siteId: string): Promise<boolean> {
    const key = `mqtt:rate:${siteId}`;
    const now = Date.now();
    const pipe = this.redis.pipeline();
    pipe.zremrangebyscore(key, 0, now - RATE_WINDOW_MS);
    pipe.zadd(key, now, `${now}-${Math.random()}`);
    pipe.zcard(key);
    pipe.expire(key, 60);
    const results = await pipe.exec();
    const count = (results?.[2]?.[1] as number) ?? 0;
    return count <= RATE_LIMIT;
  }

  // ── Adapter resolution (in-memory cached) ───────────────────────────────

  private async resolveAdapter(siteId: string): Promise<SiteAdapter | null> {
    const cached = this.adapterCache.get(siteId);
    if (cached && cached.expiresAt > Date.now()) return cached.adapter;

    const adapter = await this.adapters.findOne({ where: { siteId } });
    this.adapterCache.set(siteId, { adapter, expiresAt: Date.now() + this.ADAPTER_CACHE_TTL });
    return adapter;
  }

  // ── Org resolution (Redis-cached) ────────────────────────────────────────

  private async resolveOrg(siteId: string): Promise<string | null> {
    const cacheKey = `site:org:${siteId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const site = await this.sites.findOne({
      where: { id: siteId },
      select: ['organizationId'],
    });
    if (!site) return null;

    await this.redis.setex(cacheKey, ORG_CACHE_TTL, site.organizationId);
    return site.organizationId;
  }
}
