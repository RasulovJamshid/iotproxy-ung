import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationWorker } from './notification.worker';
import { QUEUE_NAMES } from '@iotproxy/shared';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.NOTIFICATIONS }),
  ],
  providers: [NotificationWorker],
  exports: [],
})
export class NotificationsModule {}
