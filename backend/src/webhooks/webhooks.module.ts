import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Webhook } from './webhook.entity';
import { WebhookService } from './webhook.service';
import { WebhookWorker } from './webhook.worker';
import { WebhooksController } from './webhooks.controller';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { QUEUE_NAMES } from '@iotproxy/shared';

@Module({
  imports: [
    TypeOrmModule.forFeature([Webhook]),
    BullModule.registerQueue({ name: QUEUE_NAMES.WEBHOOKS }),
    forwardRef(() => ApiKeysModule),
  ],
  controllers: [WebhooksController],
  providers: [WebhookService, WebhookWorker],
  exports: [WebhookService],
})
export class WebhooksModule {}
