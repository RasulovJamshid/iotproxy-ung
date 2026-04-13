import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FieldProfile } from './field-profile.entity';
import { Site } from '../sites/site.entity';
import { TimescaleRepository } from '../database/timescale.repository';
import { IngestJob } from '@iotproxy/shared';

@Injectable()
export class DiscoveryService {
  private readonly logger = new Logger(DiscoveryService.name);

  constructor(
    @InjectRepository(FieldProfile) private profiles: Repository<FieldProfile>,
    @InjectRepository(Site) private sites: Repository<Site>,
    private timescale: TimescaleRepository,
  ) {}

  // ── Called by ReadingsWorker for DISCOVERY-status sites ──────────────────

  async recordDiscoveryReading(job: IngestJob): Promise<void> {
    const site = await this.sites.findOne({
      where: { id: job.siteId },
      select: ['commissioningStatus', 'discoveryWindowEndsAt', 'discoveryEnabled'],
    });

    if (!site || site.commissioningStatus !== 'DISCOVERY') return;

    // Manual override: if discoveryEnabled is true, keep discovery active
    if (!site.discoveryEnabled && site.discoveryWindowEndsAt && site.discoveryWindowEndsAt < new Date()) {
      // Window expired and not manually enabled — auto-transition to REVIEW
      await this.sites.update(job.siteId, { commissioningStatus: 'REVIEW' });
      this.logger.log(`Site ${job.siteId} discovery window expired → REVIEW`);
      return;
    }

    const data = job.data as Record<string, unknown>;

    // Update Welford stats for each field
    for (const [key, val] of Object.entries(data)) {
      await this.updateFieldProfile(job.siteId, key, val);
    }

    // Store replay payload (capped at 500)
    await this.timescale.recordDiscoveryPayload(job.siteId, job);
  }

  async getFieldProfiles(siteId: string): Promise<FieldProfile[]> {
    return this.profiles.find({ where: { siteId } });
  }

  async previewConfig(siteId: string, proposedConfig: Record<string, unknown>): Promise<unknown[]> {
    const payloads = await this.timescale.getDiscoveryPayloads(siteId);
    // Apply proposed transform/alias to each replayed payload
    return payloads.map((payload) => this.applyProposedConfig(payload, proposedConfig));
  }

  // ── Cron: auto-close expired discovery windows ────────────────────────────

  @Cron(CronExpression.EVERY_5_MINUTES)
  async closeExpiredWindows() {
    const result = await this.sites
      .createQueryBuilder()
      .update(Site)
      .set({ commissioningStatus: 'REVIEW' })
      .where('commissioning_status = :s', { s: 'DISCOVERY' })
      .andWhere('discovery_window_ends_at < NOW()')
      .andWhere('discovery_enabled = :enabled', { enabled: false })
      .execute();

    if (result.affected && result.affected > 0) {
      this.logger.log(`Closed ${result.affected} expired discovery window(s)`);
    }
  }

  // ── Welford online variance algorithm ─────────────────────────────────────

  private async updateFieldProfile(siteId: string, fieldKey: string, val: unknown) {
    let profile = await this.profiles.findOne({ where: { siteId, fieldKey } });

    if (!profile) {
      profile = this.profiles.create({ siteId, fieldKey, sampleCount: 0, mean: 0, m2: 0, sampleTypes: {} });
    }

    // Track type distribution
    const typeName = typeof val;
    profile.sampleTypes = {
      ...profile.sampleTypes,
      [typeName]: (profile.sampleTypes[typeName] ?? 0) + 1,
    };

    // Welford update (numeric only)
    if (typeof val === 'number') {
      profile.sampleCount += 1;
      const delta = val - profile.mean;
      profile.mean += delta / profile.sampleCount;
      const delta2 = val - profile.mean;
      profile.m2 += delta * delta2;

      profile.minVal = profile.minVal === undefined ? val : Math.min(profile.minVal, val);
      profile.maxVal = profile.maxVal === undefined ? val : Math.max(profile.maxVal, val);
    }

    await this.profiles.save(profile);
  }

  private applyProposedConfig(payload: unknown, config: Record<string, unknown>): unknown {
    const data = (payload as Record<string, unknown>)['data'] ?? payload;
    const scale = (config['scaleMultiplier'] as number) ?? 1;
    const offset = (config['scaleOffset'] as number) ?? 0;
    const fieldMappings = (config['fieldMappings'] as Record<string, string>) ?? {};

    const result = { ...(data as Record<string, unknown>) };

    for (const [k, v] of Object.entries(result)) {
      if (typeof v === 'number') result[k] = v * scale + offset;
    }

    for (const [from, to] of Object.entries(fieldMappings)) {
      if (from in result) {
        result[to] = result[from];
        delete result[from];
      }
    }

    return result;
  }
}
