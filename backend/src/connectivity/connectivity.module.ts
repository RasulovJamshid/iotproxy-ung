import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sensor } from '../sensors/sensor.entity';
import { OfflineDetectorCron } from './offline-detector.cron';
import { WebhooksModule } from '../webhooks/webhooks.module';

@Module({
  imports: [TypeOrmModule.forFeature([Sensor]), WebhooksModule],
  providers: [OfflineDetectorCron],
})
export class ConnectivityModule {}
