import {
  Controller, Get, Delete, Param, Query, UseGuards,
  ParseUUIDPipe, UnauthorizedException, BadRequestException,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiSecurity, ApiQuery } from '@nestjs/swagger';
import { FlexibleAuthGuard } from '../auth/guards/flexible-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentOrg } from '../auth/decorators/current-org.decorator';
import { AuthUser, OrgContext } from '../auth/interfaces/auth-user.interface';
import { PERMISSIONS } from '@iotproxy/shared';
import { TimescaleRepository, ALLOWED_AGG } from '../database/timescale.repository';
import { SensorsService } from '../sensors/sensors.service';

@ApiTags('query')
@ApiBearerAuth('jwt')
@ApiSecurity('api-key')
@UseGuards(FlexibleAuthGuard)
@Controller('query')
export class QueryController {
  constructor(
    private timescale: TimescaleRepository,
    private sensors: SensorsService,
  ) {}

  /**
   * Time-series query for a single sensor.
   * Routes to raw/1h/1d based on requested range.
   */
  @Get('readings/:sensorId')
  @ApiQuery({ name: 'startTs', required: true,  type: String, description: 'ISO 8601 start timestamp (inclusive)' })
  @ApiQuery({ name: 'endTs',   required: true,  type: String, description: 'ISO 8601 end timestamp (inclusive)' })
  @ApiQuery({ name: 'agg',      enum: ['AVG','MIN','MAX','SUM','COUNT','NONE'], required: false })
  @ApiQuery({ name: 'intervalMs', type: Number, required: false, description: 'Bucket width in ms for aggregated queries' })
  @ApiQuery({ name: 'limit',    type: Number,   required: false, description: 'Max rows returned (capped at 10 000)' })
  @ApiQuery({ name: 'cursor',   type: String,   required: false, description: 'Keyset cursor: ISO timestamp of last seen row' })
  @ApiQuery({ name: 'sortDir',  enum: ['ASC', 'DESC'], required: false, description: 'Sort direction (default DESC)' })
  @ApiQuery({ name: 'minQuality', type: Number, required: false, description: 'Minimum quality_code to include' })
  @ApiQuery({ name: 'aggField', type: String,   required: false, description: 'processed_data JSON key to aggregate (required for agg != NONE on recent data)' })
  async getReadings(
    @Param('sensorId', ParseUUIDPipe) sensorId: string,
    @Query('startTs') startTs: string,
    @Query('endTs') endTs: string,
    @Query('agg') agg = 'NONE',
    @Query('intervalMs') intervalMs?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('sortDir') sortDir?: string,
    @Query('minQuality') minQuality?: string,
    @Query('aggField') aggField?: string,
    @CurrentUser() user?: AuthUser,
    @CurrentOrg() org?: OrgContext,
  ) {
    // ── Auth ────────────────────────────────────────────────────────────────
    const organizationId = user?.organizationId ?? org?.organizationId;
    if (!organizationId) throw new UnauthorizedException();
    if (org && !org.permissions.some(p => [PERMISSIONS.QUERY, PERMISSIONS.ADMIN, 'read'].includes(p))) {
      throw new UnauthorizedException('API key lacks read permission');
    }

    // ── Validate required timestamps ─────────────────────────────────────
    if (!startTs || !endTs) throw new BadRequestException('startTs and endTs are required');
    const start = new Date(startTs);
    const end   = new Date(endTs);
    if (isNaN(start.getTime())) throw new BadRequestException(`Invalid startTs: "${startTs}"`);
    if (isNaN(end.getTime()))   throw new BadRequestException(`Invalid endTs: "${endTs}"`);
    if (start >= end)           throw new BadRequestException('startTs must be before endTs');

    // ── Validate agg ─────────────────────────────────────────────────────
    const aggUpper = agg.toUpperCase();
    if (!ALLOWED_AGG.has(aggUpper)) {
      throw new BadRequestException(`Invalid agg "${agg}". Allowed: ${[...ALLOWED_AGG].join(', ')}`);
    }

    // ── Validate sortDir ─────────────────────────────────────────────────
    if (sortDir && sortDir !== 'ASC' && sortDir !== 'DESC') {
      throw new BadRequestException('sortDir must be ASC or DESC');
    }

    // ── Parse numeric params safely ──────────────────────────────────────
    const parsedIntervalMs = intervalMs !== undefined ? parseInt(intervalMs, 10) : undefined;
    if (parsedIntervalMs !== undefined && (isNaN(parsedIntervalMs) || parsedIntervalMs <= 0)) {
      throw new BadRequestException('intervalMs must be a positive integer');
    }

    const parsedLimit = limit !== undefined ? parseInt(limit, 10) : undefined;
    if (parsedLimit !== undefined && (isNaN(parsedLimit) || parsedLimit <= 0)) {
      throw new BadRequestException('limit must be a positive integer');
    }

    const parsedMinQuality = minQuality !== undefined ? parseInt(minQuality, 10) : undefined;
    if (parsedMinQuality !== undefined && isNaN(parsedMinQuality)) {
      throw new BadRequestException('minQuality must be an integer');
    }

    let parsedCursor: Date | undefined;
    if (cursor) {
      parsedCursor = new Date(cursor);
      if (isNaN(parsedCursor.getTime())) throw new BadRequestException(`Invalid cursor timestamp: "${cursor}"`);
    }

    // ── Sensor ownership check ───────────────────────────────────────────
    const sensor = await this.sensors.findOne(sensorId, organizationId);
    if (org?.siteId && sensor.siteId !== org.siteId) {
      throw new UnauthorizedException('Sensor not accessible with this API key');
    }

    return this.timescale.queryTimeSeries({
      sensorId,
      startTs: start,
      endTs:   end,
      agg:     aggUpper as any,
      intervalMs:  parsedIntervalMs,
      limit:       parsedLimit,
      cursor:      parsedCursor,
      sortDir:     (sortDir as 'ASC' | 'DESC') ?? 'DESC',
      minQuality:  parsedMinQuality,
      aggField:    aggField || undefined,
    });
  }

  /**
   * Latest reading per sensor for a site — powers the "site overview" dashboard card.
   */
  @Get('sites/:siteId/latest')
  @ApiQuery({ name: 'page', type: Number, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  async getLatest(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @CurrentUser() user?: AuthUser,
    @CurrentOrg() org?: OrgContext,
  ) {
    const organizationId = user?.organizationId ?? org?.organizationId;
    if (!organizationId) throw new UnauthorizedException();
    
    // API key must have 'read', 'query', or 'admin' permission
    if (org && !org.permissions.some(p => [PERMISSIONS.QUERY, PERMISSIONS.ADMIN, 'read'].includes(p))) {
      throw new UnauthorizedException('API key lacks read permission');
    }
    
    const effectiveSiteId = org?.siteId ?? siteId;
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? Math.min(parseInt(limit, 10), 500) : 50;
    const sensorsResult = await this.sensors.findAll(effectiveSiteId, organizationId, pageNum, limitNum);
    const ids = sensorsResult.data.map((s) => s.id);
    const readings = await this.timescale.getLatestPerSensor(ids);
    
    return {
      data: readings,
      total: sensorsResult.total,
      page: sensorsResult.page,
      limit: sensorsResult.limit,
      totalPages: sensorsResult.totalPages,
    };
  }

  /**
   * Delete a specific reading by sensor ID and phenomenon time
   */
  @Delete('readings/:sensorId/:phenomenonTime')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteReading(
    @Param('sensorId', ParseUUIDPipe) sensorId: string,
    @Param('phenomenonTime') phenomenonTime: string,
    @CurrentUser() user?: AuthUser,
    @CurrentOrg() org?: OrgContext,
  ) {
    const organizationId = user?.organizationId ?? org?.organizationId;
    if (!organizationId) throw new UnauthorizedException();
    
    // API key must have 'admin' permission
    if (org && !org.permissions.includes(PERMISSIONS.ADMIN)) {
      throw new UnauthorizedException('API key lacks admin permission');
    }
    
    // JWT users must have ADMIN role
    if (user && user.role !== 'ADMIN' && user.role !== 'SYSTEM_ADMIN') {
      throw new UnauthorizedException('Insufficient permissions');
    }
    
    // Verify sensor belongs to org
    await this.sensors.findOne(sensorId, organizationId);
    
    await this.timescale.deleteReading(sensorId, new Date(phenomenonTime), organizationId);
  }

  /**
   * Clear all readings for a sensor
   */
  @Delete('readings/:sensorId/all')
  @HttpCode(HttpStatus.OK)
  async clearAllReadings(
    @Param('sensorId', ParseUUIDPipe) sensorId: string,
    @CurrentUser() user?: AuthUser,
    @CurrentOrg() org?: OrgContext,
  ) {
    const organizationId = user?.organizationId ?? org?.organizationId;
    if (!organizationId) throw new UnauthorizedException();
    
    // API key must have 'admin' permission
    if (org && !org.permissions.includes(PERMISSIONS.ADMIN)) {
      throw new UnauthorizedException('API key lacks admin permission');
    }
    
    // JWT users must have ADMIN role
    if (user && user.role !== 'ADMIN' && user.role !== 'SYSTEM_ADMIN') {
      throw new UnauthorizedException('Insufficient permissions');
    }
    
    // Verify sensor belongs to org
    await this.sensors.findOne(sensorId, organizationId);
    
    const deletedCount = await this.timescale.clearAllReadings(sensorId, organizationId);
    return { deletedCount };
  }
}
