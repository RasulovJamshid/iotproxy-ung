import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull } from 'typeorm';
import { Sensor } from '../sensors/sensor.entity';
import { WebhookService } from '../webhooks/webhook.service';
import { WEBHOOK_EVENTS } from '@iotproxy/shared';

@Injectable()
export class OfflineDetectorCron {
  private readonly logger = new Logger(OfflineDetectorCron.name);

  constructor(
    @InjectRepository(Sensor) private sensors: Repository<Sensor>,
    private webhooks: WebhookService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async detectOfflineSensors() {
    // Only check sensors that have a known reporting interval
    const candidates = await this.sensors.find({
      where: {
        status: 'ACTIVE',
        reportingIntervalSeconds: Not(IsNull()),
      },
      select: ['id', 'organizationId', 'siteId', 'lastReadingAt', 'reportingIntervalSeconds', 'connectivityStatus'],
    });

    const now = Date.now();
    const toMarkOffline: string[] = [];
    const toMarkOnline: string[] = [];

    for (const sensor of candidates) {
      if (!sensor.lastReadingAt) continue;

      const elapsed = now - sensor.lastReadingAt.getTime();
      const threshold = sensor.reportingIntervalSeconds! * 2 * 1000;
      const isLate = elapsed > threshold;

      if (isLate && sensor.connectivityStatus !== 'OFFLINE') {
        toMarkOffline.push(sensor.id);
        await this.webhooks.dispatch(sensor.organizationId, WEBHOOK_EVENTS.SENSOR_OFFLINE, {
          sensorId: sensor.id,
          siteId: sensor.siteId,
          lastReadingAt: sensor.lastReadingAt,
        });
      } else if (!isLate && sensor.connectivityStatus === 'OFFLINE') {
        toMarkOnline.push(sensor.id);
        await this.webhooks.dispatch(sensor.organizationId, WEBHOOK_EVENTS.SENSOR_ONLINE, {
          sensorId: sensor.id,
          siteId: sensor.siteId,
        });
      }
    }

    if (toMarkOffline.length) {
      await this.sensors
        .createQueryBuilder()
        .update()
        .set({ connectivityStatus: 'OFFLINE' })
        .whereInIds(toMarkOffline)
        .execute();
      this.logger.log(`Marked ${toMarkOffline.length} sensor(s) OFFLINE`);
    }

    if (toMarkOnline.length) {
      await this.sensors
        .createQueryBuilder()
        .update()
        .set({ connectivityStatus: 'ONLINE' })
        .whereInIds(toMarkOnline)
        .execute();
      this.logger.log(`Marked ${toMarkOnline.length} sensor(s) ONLINE`);
    }
  }
}
