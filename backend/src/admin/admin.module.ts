import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { AuditLog } from './audit-log.entity';
import { Backup } from './backup.entity';
import { Organization } from '../organizations/organization.entity';
import { AdminController } from './admin.controller';
import { RetentionService } from './retention.service';
import { RollupService } from './rollup.service';
import { BackupService } from './backup.service';
import { BackupWorker } from './backup.worker';
import { QUEUE_NAMES } from '@iotproxy/shared';

@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLog, Backup, Organization]),
    BullModule.registerQueue({ name: QUEUE_NAMES.BACKUPS }),
  ],
  controllers: [AdminController],
  providers: [RetentionService, RollupService, BackupService, BackupWorker],
  exports: [RetentionService, RollupService, BackupService],
})
export class AdminModule {}
