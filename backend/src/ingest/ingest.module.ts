import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpIngestController } from './http-ingest.controller';
import { MqttIngestService } from './mqtt-ingest.service';
import { IngestQueueProducer } from './ingest-queue.producer';
import { Site } from '../sites/site.entity';
import { SiteAdapter } from '../adapters/site-adapter.entity';
import { AuthModule } from '../auth/auth.module';
import { QUEUE_NAMES } from '@iotproxy/shared';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.READINGS }),
    TypeOrmModule.forFeature([Site, SiteAdapter]),
    AuthModule,
  ],
  controllers: [HttpIngestController],
  providers: [IngestQueueProducer, MqttIngestService],
  exports: [IngestQueueProducer],
})
export class IngestModule {}
