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
}
