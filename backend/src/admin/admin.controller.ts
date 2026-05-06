import {
  Controller, Get, Post, Body, UseGuards, Param, Delete,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RetentionService } from './retention.service';
import { RollupService } from './rollup.service';
import { BackupService } from './backup.service';

@ApiTags('admin')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private retention: RetentionService,
    private rollup: RollupService,
    private backup: BackupService,
  ) {}

  @Post('organizations/:orgId/retention')
  @Roles('SYSTEM_ADMIN')
  setRetention(
    @Param('orgId') orgId: string,
    @Body('days') days: number,
  ) {
    return this.retention.setRetention(orgId, days);
  }

  @Post('organizations/:orgId/retention-config')
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  setRetentionConfig(
    @Param('orgId') orgId: string,
    @Body() body: {
      rawRetentionDays?: number;
      defaultRawRetentionDays?: number;
      defaultSummaryRetentionMonths?: number;
      defaultSummaryAggMode?: string;
    },
  ) {
    return this.retention.setRetentionConfig(orgId, body);
  }

  @Post('sensors/:sensorId/rollup')
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  async triggerRollup(
    @Param('sensorId') sensorId: string,
    @Body() body: { organizationId: string; aggField?: string; rawRetentionDays?: number },
  ) {
    const rolled = await this.rollup.rollupSensor(
      sensorId,
      body.organizationId,
      body.aggField ?? 'value',
      body.rawRetentionDays ?? 7,
    );
    return { rolledUp: rolled };
  }

  @Get('organizations/:orgId/retention-preview')
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  previewRetention(@Param('orgId') orgId: string) {
    return this.retention.previewRetention(orgId);
  }

  @Post('organizations/:orgId/retention/run')
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  runRetention(@Param('orgId') orgId: string) {
    return this.retention.runRetentionForOrg(orgId);
  }

  // ── Backup & Restore ──────────────────────────────────────────────────────

  @Post('organizations/:orgId/backups')
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  createBackup(
    @Param('orgId') orgId: string,
    @Body() body?: { backupType?: 'FULL' | 'INCREMENTAL' },
  ) {
    return this.backup.createBackup(orgId, body?.backupType);
  }

  @Get('organizations/:orgId/backups')
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  listBackups(@Param('orgId') orgId: string) {
    return this.backup.listBackups(orgId);
  }

  @Get('organizations/:orgId/backups/:id')
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  getBackup(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.backup.getBackup(id, orgId);
  }

  @Delete('organizations/:orgId/backups/:id')
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  deleteBackup(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.backup.deleteBackup(id, orgId);
  }

  @Get('organizations/:orgId/backups/:id/download')
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  getBackupDownloadUrl(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.backup.getDownloadUrl(id, orgId);
  }

  @Post('organizations/:orgId/backups/:id/restore')
  @Roles('SYSTEM_ADMIN')
  restoreBackup(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.backup.restoreBackup(id, orgId);
  }
}
