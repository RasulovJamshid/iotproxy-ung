import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SiteAdapter } from './site-adapter.entity';
import { QUEUE_NAMES } from '@iotproxy/shared';

@Injectable()
export class AdaptersService {
  constructor(
    @InjectRepository(SiteAdapter) private repo: Repository<SiteAdapter>,
    @InjectQueue(QUEUE_NAMES.PULL) private pullQueue: Queue,
  ) {}

  findAll(organizationId: string) {
    return this.repo.find({ where: { organizationId } });
  }

  async findOne(siteId: string, organizationId: string) {
    const adapter = await this.repo.findOne({ where: { siteId, organizationId } });
    if (!adapter) throw new NotFoundException(`Adapter for site ${siteId} not found`);
    return adapter;
  }

  async findBySiteId(siteId: string): Promise<SiteAdapter | null> {
    return this.repo.findOne({ where: { siteId } });
  }

  async upsert(
    siteId: string,
    organizationId: string,
    data: Partial<SiteAdapter>,
  ): Promise<SiteAdapter> {
    let adapter = await this.repo.findOne({ where: { siteId, organizationId } });

    if (adapter) {
      await this.repo.update(adapter.id, data as any);
      adapter = await this.repo.findOne({ where: { siteId, organizationId } }) as SiteAdapter;
    } else {
      adapter = await this.repo.save(
        this.repo.create({ siteId, organizationId, ...data }),
      );
    }

    // Re-sync the BullMQ repeatable job whenever pull config changes
    await this.syncPullJob(adapter);
    return adapter;
  }

  async delete(siteId: string, organizationId: string) {
    const adapter = await this.findOne(siteId, organizationId);
    await this.removePullJob(adapter.id);
    await this.repo.delete(adapter.id);
  }

  // ── Trigger a manual pull immediately ──────────────────────────────────────

  async triggerPull(siteId: string, organizationId: string) {
    const adapter = await this.findOne(siteId, organizationId);
    if (!adapter.pullEnabled || !adapter.pullUrl) {
      throw new NotFoundException('Pull is not configured or enabled for this site');
    }
    await this.pullQueue.add('pull', { adapterId: adapter.id }, { attempts: 1, removeOnFail: { count: 20 } });
    return { queued: true };
  }

  // ── Schedule management ───────────────────────────────────────────────────

  async syncPullJob(adapter: SiteAdapter) {
    await this.removePullJob(adapter.id);
    if (adapter.pullEnabled && adapter.pullUrl && adapter.pullIntervalSec > 0) {
      await this.pullQueue.add(
        'pull',
        { adapterId: adapter.id },
        {
          repeat: { every: adapter.pullIntervalSec * 1000 },
          jobId: `pull:${adapter.id}`,
          attempts: 2,
          backoff: { type: 'exponential', delay: 10_000 },
          removeOnComplete: { count: 20 },
          removeOnFail: { count: 50 },
        },
      );
    }
  }

  private async removePullJob(adapterId: string) {
    const repeatableJobs = await this.pullQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      if (job.id === `pull:${adapterId}`) {
        await this.pullQueue.removeRepeatableByKey(job.key);
      }
    }
  }

  // ── Bootstrap: re-register all enabled adapters on startup ───────────────

  async bootstrapSchedules() {
    const adapters = await this.repo.find({ where: { pullEnabled: true } });
    for (const adapter of adapters) {
      await this.syncPullJob(adapter);
    }
  }

  // ── Schema Discovery ──────────────────────────────────────────────────────

  discoverSchema(sample: unknown): DiscoveryResult {
    // Find the readings array. Try common wrappers: $.data, $.items, $.result, root array
    let items: unknown[] | null = null;
    let readingsPath = '$[*]';

    if (Array.isArray(sample)) {
      items = sample;
      readingsPath = '$[*]';
    } else if (sample && typeof sample === 'object') {
      const obj = sample as Record<string, unknown>;
      for (const key of ['data', 'items', 'result', 'readings', 'records', 'rows']) {
        if (Array.isArray(obj[key])) {
          items = obj[key] as unknown[];
          readingsPath = `$.${key}[*]`;
          break;
        }
      }
      // Fallback: first array-valued key
      if (!items) {
        for (const [key, val] of Object.entries(obj)) {
          if (Array.isArray(val) && val.length > 0) {
            items = val as unknown[];
            readingsPath = `$.${key}[*]`;
            break;
          }
        }
      }
    }

    if (!items || items.length === 0) {
      return {
        readingsPath: '$[*]',
        totalItems: 0,
        fields: [],
        uniqueSensorIds: [],
        suggestions: { sensorIdPath: '', discriminatorField: null, phenomenonTimePath: '', dataFields: [] },
        discriminatorDetected: false,
      };
    }

    // Collect field metadata from first few items
    const sampleSize = Math.min(items.length, 20);
    const fieldStats: Map<string, FieldStat> = new Map();

    for (let i = 0; i < sampleSize; i++) {
      const item = items[i];
      if (!item || typeof item !== 'object') continue;
      for (const [key, val] of Object.entries(item as Record<string, unknown>)) {
        if (!fieldStats.has(key)) {
          fieldStats.set(key, { key, type: typeof val, values: new Set(), numericCount: 0, total: 0 });
        }
        const stat = fieldStats.get(key)!;
        stat.total++;
        stat.values.add(String(val));
        if (typeof val === 'number') stat.numericCount++;
      }
    }

    const fields: DiscoveredField[] = Array.from(fieldStats.entries()).map(([key, stat]) => ({
      key,
      jsonPath: `$.${key}`,
      type: stat.numericCount === stat.total ? 'number' : stat.type,
      uniqueValueCount: stat.values.size,
      sampleValues: Array.from(stat.values).slice(0, 5),
      isProbablyId:    stat.values.size <= sampleSize * 0.7 && stat.type === 'string',
      isProbablyTime:  /time|date|at|when/i.test(key) || stat.values.size === sampleSize,
      isProbablyNumeric: stat.numericCount === stat.total,
      isProbablyDiscriminator: stat.values.size > 1 && stat.values.size <= Math.ceil(sampleSize / 2) && stat.type === 'string',
    }));

    // ── Classify fields ──────────────────────────────────────────────────────

    // Best sensor ID: string field with low cardinality across all items
    const siteIdCandidates = fields
      .filter(f => f.isProbablyId && !f.isProbablyTime)
      .sort((a, b) => a.uniqueValueCount - b.uniqueValueCount);

    // Best discriminator: low-cardinality string field DIFFERENT from the sensor id
    const discriminatorCandidates = fields
      .filter(f => f.isProbablyDiscriminator && !f.isProbablyTime)
      .sort((a, b) => a.uniqueValueCount - b.uniqueValueCount);

    // Best timestamp: field whose name suggests time
    const timeCandidates = fields.filter(f => f.isProbablyTime);

    // Numeric fields = data payload candidates
    const dataFieldCandidates = fields.filter(f => f.isProbablyNumeric);

    const sensorIdPath = siteIdCandidates[0]?.jsonPath ?? '';

    // Detect discriminator: when there's a low-cardinality label field AND multiple items
    // share the SAME sensorId — classic "one row per product type" pattern
    let discriminatorField: string | null = null;
    if (siteIdCandidates[0] && discriminatorCandidates.length > 0) {
      // Pick the discriminator candidate that is NOT the sensorId field
      const disc = discriminatorCandidates.find(f => f.key !== siteIdCandidates[0].key);
      if (disc) discriminatorField = disc.jsonPath;
    }

    // Compute actual unique sensor IDs with discriminator applied
    const sensorIdStat = fieldStats.get(siteIdCandidates[0]?.key ?? '');
    const discStat     = discriminatorField
      ? fieldStats.get(discriminatorCandidates.find(f => f.jsonPath === discriminatorField)?.key ?? '')
      : null;

    let uniqueSensorIds: string[] = [];
    if (sensorIdStat) {
      if (discStat && discriminatorField) {
        // Cross-product isn't reliable from stats alone — show composite examples
        uniqueSensorIds = [...sensorIdStat.values].flatMap(sid =>
          [...(discStat.values)].map(disc => `${sid}:${disc}`)
        ).slice(0, 10);
      } else {
        uniqueSensorIds = [...sensorIdStat.values].slice(0, 10);
      }
    }

    return {
      readingsPath,
      totalItems: items.length,
      fields,
      uniqueSensorIds,
      discriminatorDetected: !!discriminatorField,
      suggestions: {
        sensorIdPath,
        discriminatorField,
        phenomenonTimePath: timeCandidates[0]?.jsonPath ?? '',
        dataFields: dataFieldCandidates.map(f => ({ key: f.key, path: f.jsonPath })),
      },
    };
  }
}

// ── Discovery types ────────────────────────────────────────────────────────────

interface FieldStat {
  key: string;
  type: string;
  values: Set<string>;
  numericCount: number;
  total: number;
}

export interface DiscoveredField {
  key: string;
  jsonPath: string;
  type: string;
  uniqueValueCount: number;
  sampleValues: string[];
  isProbablyId: boolean;
  isProbablyTime: boolean;
  isProbablyNumeric: boolean;
  isProbablyDiscriminator: boolean;
}

export interface DiscoveryResult {
  readingsPath: string;
  totalItems: number;
  fields: DiscoveredField[];
  uniqueSensorIds: string[];
  discriminatorDetected: boolean;
  suggestions: {
    sensorIdPath: string;
    discriminatorField: string | null;
    phenomenonTimePath: string;
    dataFields: { key: string; path: string }[];
  };
}
