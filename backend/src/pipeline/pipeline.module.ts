import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { PipelineService } from './pipeline.service';
import { ReadingsWorker } from './readings.worker';
import { LastReadingFlushCron } from './last-reading-flush.cron';
import { ValidateStage } from './stages/validate.stage';
import { FilterStage } from './stages/filter.stage';
import { TransformStage } from './stages/transform.stage';
import { AliasStage } from './stages/alias.stage';
import { DerivedStage } from './stages/derived.stage';
import { AlertStage } from './stages/alert.stage';
import { Sensor } from '../sensors/sensor.entity';
import { SensorConfig } from '../sensors/sensor-config.entity';
import { VirtualSensor } from '../sensors/virtual-sensor.entity';
import { AlertRule } from '../alerts/alert-rule.entity';
import { AlertEvent } from '../alerts/alert-event.entity';
import { QueryModule } from '../query/query.module';
import { DiscoveryModule } from '../discovery/discovery.module';
import { QUEUE_NAMES } from '@iotproxy/shared';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_NAMES.READINGS },
      { name: QUEUE_NAMES.NOTIFICATIONS },
    ),
    TypeOrmModule.forFeature([
      Sensor, SensorConfig, VirtualSensor, AlertRule, AlertEvent,
    ]),
    QueryModule,
    DiscoveryModule,
  ],
  providers: [
    PipelineService,
    ReadingsWorker,
    LastReadingFlushCron,
    ValidateStage,
    FilterStage,
    TransformStage,
    AliasStage,
    DerivedStage,
    AlertStage,
  ],
  exports: [PipelineService],
})
export class PipelineModule {}
