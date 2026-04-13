import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
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

  // Run nightly at 02:00
  @Cron('0 2 * * *')
  async enforceRetentionPolicies() {
    const orgs = await this.orgs.find({
      where: { isActive: true },
      select: ['id', 'rawRetentionDays'],
    });

    for (const org of orgs) {
      if (!org.rawRetentionDays) continue;

      try {
        const deleted = await this.timescale.deleteOlderThan(org.id, org.rawRetentionDays);
        if (deleted > 0) {
          this.logger.log(
            `Retention: deleted ${deleted} readings for org ${org.id} (>${org.rawRetentionDays}d)`,
          );
        }
      } catch (err) {
        this.logger.error(`Retention failed for org ${org.id}`, err);
      }
    }
  }

  async setRetention(organizationId: string, days: number) {
    await this.orgs.update(organizationId, { rawRetentionDays: days });
  }
}
