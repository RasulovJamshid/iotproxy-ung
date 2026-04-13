import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { SiteAdapter } from './site-adapter.entity';
import { AdapterTemplate } from './adapter-template.entity';
import { AdaptersService } from './adapters.service';
import { AdaptersController } from './adapters.controller';
import { AdapterTemplatesService } from './adapter-templates.service';
import { AdapterTemplatesController } from './adapter-templates.controller';
import { PullWorker } from './pull.worker';
import { IngestModule } from '../ingest/ingest.module';
import { QUEUE_NAMES } from '@iotproxy/shared';

@Module({
  imports: [
    TypeOrmModule.forFeature([SiteAdapter, AdapterTemplate]),
    BullModule.registerQueue({ name: QUEUE_NAMES.PULL }),
    IngestModule,
  ],
  controllers: [AdaptersController, AdapterTemplatesController],
  providers: [AdaptersService, AdapterTemplatesService, PullWorker],
  exports: [AdaptersService, AdapterTemplatesService],
})
export class AdaptersModule implements OnModuleInit {
  constructor(private service: AdaptersService) {}

  async onModuleInit() {
    await this.service.bootstrapSchedules();
  }
}
