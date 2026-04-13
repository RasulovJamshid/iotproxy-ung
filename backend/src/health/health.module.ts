import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { HealthController } from './health.controller';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { QUEUE_NAMES } from '@iotproxy/shared';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.READINGS }),
  ],
  controllers: [HealthController, MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class HealthModule {}
