import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Redis } from 'ioredis';
import { Sensor } from '../sensors/sensor.entity';

const DIRTY_SET = 'sensor:lastReading:dirty';

/**
 * Every 60s, pop all dirty sensor IDs from Redis and flush
 * lastReadingAt + connectivity status to Postgres in a bulk update.
 * Keeps the hot ingest path free of DB writes.
 */
@Injectable()
export class LastReadingFlushCron {
  private readonly logger = new Logger(LastReadingFlushCron.name);

  constructor(
    @InjectRepository(Sensor) private sensors: Repository<Sensor>,
    @Inject('CACHE_REDIS') private redis: Redis,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async flush() {
    const dirty = await this.redis.smembers(DIRTY_SET);
    if (dirty.length === 0) return;

    await this.redis.del(DIRTY_SET);

    const updates: Array<{ id: string; lastReadingAt: Date }> = [];
    for (const sensorId of dirty) {
      const ts = await this.redis.get(`sensor:lastReading:${sensorId}`);
      if (ts) updates.push({ id: sensorId, lastReadingAt: new Date(ts) });
    }

    for (const u of updates) {
      await this.sensors.update(u.id, {
        lastReadingAt: u.lastReadingAt,
        connectivityStatus: 'ONLINE',
      });
    }

    if (updates.length > 0) {
      this.logger.debug(`Flushed lastReadingAt for ${updates.length} sensor(s)`);
    }
  }
}
