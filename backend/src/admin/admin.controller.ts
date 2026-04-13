import {
  Controller, Get, Post, Body, UseGuards, Param,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RetentionService } from './retention.service';

@ApiTags('admin')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin')
export class AdminController {
  constructor(private retention: RetentionService) {}

  @Post('organizations/:orgId/retention')
  @Roles('SYSTEM_ADMIN')
  setRetention(
    @Param('orgId') orgId: string,
    @Body('days') days: number,
  ) {
    return this.retention.setRetention(orgId, days);
  }
}
