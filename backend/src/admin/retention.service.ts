import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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
      // Always run — the SQL uses NULLIF to treat 0 as unlimited and
      // excludes sensors whose effective retention is NULL (all levels unlimited).
      const defaultDays = org.defaultRawRetentionDays ?? 0;
      try {
        const sensors = await this.timescale.getSensorsNeedingRollup(org.id, defaultDays);
        let totalDeleted = 0;

        if (sensors.length > 0) {
          const earliestCutoff = sensors.reduce(
            (min, s) => s.cutoffDate < min ? s.cutoffDate : min,
            sensors[0].cutoffDate,
          );
          await this.timescale.decompressChunksOlderThan(earliestCutoff);
        }

        for (const { sensorId, aggField, cutoffDate } of sensors) {
          // Just-in-time rollup to guarantee summaries exist prior to purge
          try {
            const rolled = await this.timescale.rollupDailySummary(
              sensorId,
              org.id,
              aggField,
              cutoffDate,
            );
            if (rolled > 0) {
              this.logger.log(
                `Retention: materialised ${rolled} daily summaries for sensor ${sensorId} (org ${org.id}) before purge`,
              );
            }
          } catch (err) {
            this.logger.error(
              `On-demand rollup failed for sensor ${sensorId}`,
              err instanceof Error ? err.stack : String(err),
            );
          }

          // Now safely delete raw data older than cutoff
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

      // ── 2. Summary retention purge ────────────────────────────────────
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

  async runRetentionForOrg(organizationId: string): Promise<{
    sensorsProcessed: number;
    rawReadingsDeleted: number;
    summariesCreated: number;
    summariesPurged: number;
  }> {
    const org = await this.orgs.findOne({
      where: { id: organizationId },
      select: ['id', 'rawRetentionDays', 'defaultRawRetentionDays', 'defaultSummaryRetentionMonths'],
    });
    if (!org) throw new NotFoundException(`Organization ${organizationId} not found`);

    const defaultDays = org.defaultRawRetentionDays ?? 0;
    const sensors = await this.timescale.getSensorsNeedingRollup(organizationId, defaultDays);

    // Decompress any TimescaleDB chunks that overlap the retention window before
    // attempting per-row DELETE — compressed chunks silently return 0 deleted rows.
    if (sensors.length > 0) {
      const earliestCutoff = sensors.reduce(
        (min, s) => s.cutoffDate < min ? s.cutoffDate : min,
        sensors[0].cutoffDate,
      );
      await this.timescale.decompressChunksOlderThan(earliestCutoff);
    }

    let rawReadingsDeleted = 0;
    let summariesCreated = 0;

    for (const { sensorId, aggField, cutoffDate } of sensors) {
      try {
        const rolled = await this.timescale.rollupDailySummary(sensorId, org.id, aggField, cutoffDate);
        summariesCreated += rolled;
      } catch (err) {
        this.logger.error(
          `On-demand rollup failed for sensor ${sensorId}`,
          err instanceof Error ? err.stack : String(err),
        );
      }
      try {
        const deleted = await this.timescale.deleteRawOlderThanPerSensor(sensorId, cutoffDate);
        rawReadingsDeleted += deleted;
      } catch (err) {
        this.logger.error(
          `Raw retention failed for sensor ${sensorId}`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }

    let summariesPurged = 0;
    const summaryMonths = org.defaultSummaryRetentionMonths;
    if (summaryMonths && summaryMonths > 0) {
      try {
        summariesPurged = await this.timescale.purgeSummariesOlderThan(organizationId, summaryMonths);
      } catch (err) {
        this.logger.error(
          `Summary retention failed for org ${organizationId}`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }

    this.logger.log(
      `Manual retention run for org ${organizationId}: ` +
      `${sensors.length} sensors, ${summariesCreated} summaries created, ` +
      `${rawReadingsDeleted} raw deleted, ${summariesPurged} summaries purged`,
    );

    return { sensorsProcessed: sensors.length, summariesCreated, rawReadingsDeleted, summariesPurged };
  }

  async setRetention(organizationId: string, days: number) {
    await this.orgs.update(organizationId, { defaultRawRetentionDays: days });
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

  /**
   * Preview retention impact: shows what data will be deleted for each sensor.
   */
  async previewRetention(organizationId: string) {
    const org = await this.orgs.findOne({
      where: { id: organizationId },
      select: ['id', 'defaultRawRetentionDays', 'defaultSummaryRetentionMonths'],
    });
    if (!org) return { sensors: [], summary: { totalSensors: 0, totalReadingsToDelete: 0 } };

    const defaultDays = org.defaultRawRetentionDays ?? 0;
    const sensors = await this.timescale.getSensorsNeedingRollup(organizationId, defaultDays);

    const preview = await Promise.all(
      sensors.map(async ({ sensorId, cutoffDate }) => {
        const count = await this.timescale.countReadingsOlderThan(sensorId, cutoffDate);
        return { sensorId, cutoffDate, readingsToDelete: count };
      }),
    );

    const totalReadingsToDelete = preview.reduce((sum, p) => sum + p.readingsToDelete, 0);

    return {
      sensors: preview,
      summary: {
        totalSensors: preview.length,
        totalReadingsToDelete,
        defaultRawRetentionDays: org.defaultRawRetentionDays,
        defaultSummaryRetentionMonths: org.defaultSummaryRetentionMonths,
      },
    };
  }
}
