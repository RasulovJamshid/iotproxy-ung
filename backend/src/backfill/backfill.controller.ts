import {
  Controller, Post, Get, Delete, Body, Param, Query,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { BackfillService, CreateBackfillRunDto } from './backfill.service';

@ApiTags('backfill')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('backfill/runs')
export class BackfillController {
  constructor(private service: BackfillService) {}

  /**
   * Start a new backfill run.
   *
   * The run splits [startDate, endDate] into windows of the given chunkSize
   * and enqueues one HTTP fetch job per window.  Use delayBetweenChunksMs to
   * throttle against external-API rate limits (e.g. 1000 = 1 req/sec).
   */
  @Post()
  @Roles('ADMIN')
  create(@Body() body: CreateBackfillRunDto, @CurrentUser() user: AuthUser) {
    return this.service.create(body, user.organizationId);
  }

  @Get()
  @Roles('VIEWER')
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('adapterId') adapterId?: string,
  ) {
    return this.service.findAll(user.organizationId, adapterId);
  }

  @Get(':runId')
  @Roles('VIEWER')
  findOne(@Param('runId') runId: string, @CurrentUser() user: AuthUser) {
    return this.service.findOne(runId, user.organizationId);
  }

  @Delete(':runId')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  cancel(@Param('runId') runId: string, @CurrentUser() user: AuthUser) {
    return this.service.cancel(runId, user.organizationId);
  }
}
