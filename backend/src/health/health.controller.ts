import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { TimescaleRepository } from '../database/timescale.repository';
import { QUEUE_NAMES } from '@iotproxy/shared';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private timescale: TimescaleRepository,
    @InjectQueue(QUEUE_NAMES.READINGS) private queue: Queue,
    @Inject('CACHE_REDIS') private redis: Redis,
  ) {}

  @Get()
  async check() {
    const [db, redisOk, queueDepth] = await Promise.all([
      this.timescale.getHealthStatus(),
      this.pingRedis(),
      this.queue.getWaitingCount(),
    ]);

    const queueStatus = queueDepth > 10_000 ? 'degraded' : 'ok';
    const overall = db.ok && redisOk && queueStatus === 'ok' ? 'ok' : 'degraded';

    return {
      status: overall,
      checks: {
        database: db.ok ? 'ok' : 'error',
        database_latency_ms: db.latencyMs,
        redis: redisOk ? 'ok' : 'error',
        queue_depth: { status: queueStatus, depth: queueDepth },
      },
    };
  }

  private async pingRedis(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch {
      return false;
    }
  }
}
