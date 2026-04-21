import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from '../organizations/organization.entity';
import { TimescaleRepository } from '../database/timescale.repository';

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    @InjectRepository(Organization) private orgs: Repository<Organization>,
    private timescale: TimescaleRepository,
  ) {}

  // Run nightly at 02:00 — AFTER rollup at 01:00
  @Cron('0 2 * * *')
  async enforceRetentionPolicies() {
    this.logger.log('Starting nightly retention enforcement');

    const orgs = await this.orgs.find({
      where: { isActive: true },
      select: [
        'id',
        'rawRetentionDays',
        'defaultRawRetentionDays',
        'defaultSummaryRetentionMonths',
      ],
    });

    for (const org of orgs) {
      // ── 1. Per-sensor raw data deletion ───────────────────────────────
      const defaultDays = org.defaultRawRetentionDays ?? 7;
      if (defaultDays > 0) {
        try {
          const sensors = await this.timescale.getSensorsNeedingRollup(org.id, defaultDays);
          let totalDeleted = 0;

          for (const { sensorId, cutoffDate } of sensors) {
            try {
              const deleted = await this.timescale.deleteRawOlderThanPerSensor(sensorId, cutoffDate);
              totalDeleted += deleted;
            } catch (err) {
              this.logger.error(
                `Raw retention failed for sensor ${sensorId}`,
                err instanceof Error ? err.stack : String(err),
              );
            }
          }

          if (totalDeleted > 0) {
            this.logger.log(
              `Retention: deleted ${totalDeleted} raw readings for org ${org.id}`,
            );
          }
        } catch (err) {
          this.logger.error(
            `Raw retention query failed for org ${org.id}`,
            err instanceof Error ? err.stack : String(err),
          );
        }
      }

      // ── 2. Legacy org-level bulk deletion (backward compat) ───────────
      if (org.rawRetentionDays && org.rawRetentionDays > 0) {
        try {
          const deleted = await this.timescale.deleteOlderThan(org.id, org.rawRetentionDays);
          if (deleted > 0) {
            this.logger.log(
              `Retention (legacy): deleted ${deleted} readings for org ${org.id} (>${org.rawRetentionDays}d)`,
            );
          }
        } catch (err) {
          this.logger.error(
            `Legacy retention failed for org ${org.id}`,
            err instanceof Error ? err.stack : String(err),
          );
        }
      }

      // ── 3. Summary retention purge ────────────────────────────────────
      const summaryMonths = org.defaultSummaryRetentionMonths;
      if (summaryMonths && summaryMonths > 0) {
        try {
          const purged = await this.timescale.purgeSummariesOlderThan(org.id, summaryMonths);
          if (purged > 0) {
            this.logger.log(
              `Retention: purged ${purged} daily summaries for org ${org.id} (>${summaryMonths} months)`,
            );
          }
        } catch (err) {
          this.logger.error(
            `Summary retention failed for org ${org.id}`,
            err instanceof Error ? err.stack : String(err),
          );
        }
      }
    }

    this.logger.log('Nightly retention enforcement complete');
  }

  async setRetention(organizationId: string, days: number) {
    await this.orgs.update(organizationId, { rawRetentionDays: days });
  }

  async setRetentionConfig(
    organizationId: string,
    config: {
      rawRetentionDays?: number;
      defaultRawRetentionDays?: number;
      defaultSummaryRetentionMonths?: number;
      defaultSummaryAggMode?: string;
    },
  ) {
    await this.orgs.update(organizationId, config);
  }
}
