import {
  Controller, Get, Post, Body, UseGuards, Param,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RetentionService } from './retention.service';
import { RollupService } from './rollup.service';

@ApiTags('admin')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private retention: RetentionService,
    private rollup: RollupService,
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
}
