import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ExportJob } from './export-job.entity';
import { ExportService } from './export.service';
import { ExportWorker } from './export.worker';
import { ExportController } from './export.controller';
import { QUEUE_NAMES } from '@iotproxy/shared';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExportJob]),
    BullModule.registerQueue({ name: QUEUE_NAMES.EXPORTS }),
  ],
  controllers: [ExportController],
  providers: [ExportService, ExportWorker],
})
export class ExportModule {}
