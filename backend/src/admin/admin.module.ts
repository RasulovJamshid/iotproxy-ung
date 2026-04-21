import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from './audit-log.entity';
import { Organization } from '../organizations/organization.entity';
import { AdminController } from './admin.controller';
import { RetentionService } from './retention.service';
import { RollupService } from './rollup.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLog, Organization]),
  ],
  controllers: [AdminController],
  providers: [RetentionService, RollupService],
  exports: [RetentionService, RollupService],
})
export class AdminModule {}
