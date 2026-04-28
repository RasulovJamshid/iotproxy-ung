import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from '../organizations/organization.entity';
import { TimescaleRepository } from '../database/timescale.repository';

@Injectable()
export class RollupService {
  private readonly logger = new Logger(RollupService.name);

  constructor(
    @InjectRepository(Organization) private orgs: Repository<Organization>,
    private timescale: TimescaleRepository,
  ) {}

  // Run nightly at 01:00 — BEFORE retention purge at 02:00
  @Cron('0 1 * * *')
  async rollupDailySummaries() {
    this.logger.log('Starting nightly daily-summary rollup');

    const orgs = await this.orgs.find({
      where: { isActive: true },
      select: ['id', 'defaultRawRetentionDays'],
    });

    let totalRolled = 0;

    for (const org of orgs) {
      // Always run — the SQL uses NULLIF to treat 0 as unlimited and
      // excludes sensors whose effective retention is NULL (all levels unlimited).
      const defaultDays = org.defaultRawRetentionDays ?? 0;

      try {
        const sensors = await this.timescale.getSensorsNeedingRollup(org.id, defaultDays);

        for (const { sensorId, aggField, cutoffDate } of sensors) {
          try {
            const rolled = await this.timescale.rollupDailySummary(
              sensorId,
              org.id,
              aggField,
              cutoffDate,
            );
            if (rolled > 0) {
              this.logger.log(
                `Rollup: ${rolled} daily summaries for sensor ${sensorId} (org ${org.id})`,
              );
              totalRolled += rolled;
            }
          } catch (err) {
            this.logger.error(
              `Rollup failed for sensor ${sensorId}`,
              err instanceof Error ? err.stack : String(err),
            );
          }
        }
      } catch (err) {
        this.logger.error(
          `Rollup query failed for org ${org.id}`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }

    this.logger.log(`Nightly rollup complete: ${totalRolled} summary rows materialised`);
  }

  /**
   * Manually trigger rollup for a specific sensor (e.g. from admin endpoint).
   */
  async rollupSensor(
    sensorId: string,
    organizationId: string,
    aggField: string,
    rawRetentionDays: number,
  ): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - rawRetentionDays);
    // Snap to start of day
    cutoffDate.setHours(0, 0, 0, 0);

    return this.timescale.rollupDailySummary(sensorId, organizationId, aggField, cutoffDate);
  }
}
