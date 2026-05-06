import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { BackfillRun } from './backfill-run.entity';
import { BackfillService } from './backfill.service';
import { BackfillWorker } from './backfill.worker';
import { BackfillController } from './backfill.controller';
import { SiteAdapter } from '../adapters/site-adapter.entity';
import { IngestModule } from '../ingest/ingest.module';
import { QUEUE_NAMES } from '@iotproxy/shared';

@Module({
  imports: [
    TypeOrmModule.forFeature([BackfillRun, SiteAdapter]),
    BullModule.registerQueue({ name: QUEUE_NAMES.BACKFILL }),
    IngestModule,
  ],
  controllers: [BackfillController],
  providers: [BackfillService, BackfillWorker],
})
export class BackfillModule {}
