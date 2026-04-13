import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { SiteAdapter } from './site-adapter.entity';
import { AdaptersService } from './adapters.service';
import { AdaptersController } from './adapters.controller';
import { PullWorker } from './pull.worker';
import { IngestModule } from '../ingest/ingest.module';
import { QUEUE_NAMES } from '@iotproxy/shared';

@Module({
  imports: [
    TypeOrmModule.forFeature([SiteAdapter]),
    BullModule.registerQueue({ name: QUEUE_NAMES.PULL }),
    IngestModule,
  ],
  controllers: [AdaptersController],
  providers: [AdaptersService, PullWorker],
  exports: [AdaptersService],
})
export class AdaptersModule implements OnModuleInit {
  constructor(private service: AdaptersService) {}

  async onModuleInit() {
    await this.service.bootstrapSchedules();
  }
}
