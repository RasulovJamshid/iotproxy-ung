import {
  Controller, Get, Post, Delete, Body, Param, Query, UseGuards,
  ParseUUIDPipe, UnauthorizedException, BadRequestException,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiSecurity, ApiQuery } from '@nestjs/swagger';
import { FlexibleAuthGuard } from '../auth/guards/flexible-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentOrg } from '../auth/decorators/current-org.decorator';
import { AuthUser, OrgContext } from '../auth/interfaces/auth-user.interface';
import { PERMISSIONS } from '@iotproxy/shared';
import { canRead, canQuery } from '../auth/permission.helpers';
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
  @ApiQuery({ name: 'agg',      enum: ['AVG','MIN','MAX','SUM','LATEST','COUNT','NONE'], required: false })
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
    if (org && !canQuery(org)) {
      throw new UnauthorizedException('API key lacks query permission');
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
      aggField:    aggField || sensor.aggField || 'value',
      rawRetentionDays: sensor.rawRetentionDays ?? undefined,
    });
  }

  /**
   * Daily summaries for a single sensor from readings_daily_summary.
   * Useful for charts covering historical ranges beyond raw retention.
   */
  @Get('readings/:sensorId/summary/daily')
  @ApiQuery({ name: 'startTs', required: true,  type: String, description: 'ISO 8601 start date (inclusive)' })
  @ApiQuery({ name: 'endTs',   required: true,  type: String, description: 'ISO 8601 end date (inclusive)' })
  @ApiQuery({ name: 'sortDir', enum: ['ASC', 'DESC'], required: false, description: 'Sort direction (default ASC)' })
  @ApiQuery({ name: 'limit',   type: Number, required: false, description: 'Max rows (capped at 10 000)' })
  async getDailySummary(
    @Param('sensorId', ParseUUIDPipe) sensorId: string,
    @Query('startTs') startTs: string,
    @Query('endTs') endTs: string,
    @Query('sortDir') sortDir?: string,
    @Query('limit') limit?: string,
    @CurrentUser() user?: AuthUser,
    @CurrentOrg() org?: OrgContext,
  ) {
    const organizationId = user?.organizationId ?? org?.organizationId;
    if (!organizationId) throw new UnauthorizedException();

    if (!startTs || !endTs) throw new BadRequestException('startTs and endTs are required');
    const start = new Date(startTs);
    const end   = new Date(endTs);
    if (isNaN(start.getTime())) throw new BadRequestException(`Invalid startTs: "${startTs}"`);
    if (isNaN(end.getTime()))   throw new BadRequestException(`Invalid endTs: "${endTs}"`);
    if (start > end)            throw new BadRequestException('startTs must be before or equal to endTs');

    // Ensure sensor belongs to org
    await this.sensors.findOne(sensorId, organizationId);

    return this.timescale.queryDailySummary(
      sensorId,
      start,
      end,
      (sortDir as 'ASC' | 'DESC') ?? 'ASC',
      limit ? Math.min(parseInt(limit, 10), 10_000) : undefined,
    );
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
    
    if (org && !canRead(org)) {
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

  /**
   * Advanced search: multi-sensor, time-range, exact-time, filtering, sorting,
   * pagination, and field selection. Returns data + metadata with actual
   * start/end boundaries.
   */
  @Post('readings/search')
  async searchReadings(
    @Body() body: {
      sensorIds?: string[];
      siteId?: string;
      startTs?: string;
      endTs?: string;
      /** Exact clock time filter, e.g. "11:00" — returns only readings at that time of day */
      exactTime?: string;
      agg?: string;
      intervalMs?: number;
      aggField?: string;
      sortBy?: 'time' | 'value' | 'sensor' | 'quality';
      sortDir?: 'ASC' | 'DESC';
      minQuality?: number;
      limit?: number;
      offset?: number;
      /** Only return these keys from processed_data */
      fields?: string[];
      /** If false, force raw-only search (do not include archived daily summaries) */
      includeSummaries?: boolean;
    },
    @CurrentUser() user?: AuthUser,
    @CurrentOrg() org?: OrgContext,
  ) {
    const organizationId = user?.organizationId ?? org?.organizationId;
    if (!organizationId) throw new UnauthorizedException();
    if (org && !canQuery(org)) {
      throw new UnauthorizedException('API key lacks query permission');
    }

    // Validate agg if provided
    if (body.agg) {
      const aggUpper = body.agg.toUpperCase();
      if (!ALLOWED_AGG.has(aggUpper)) {
        throw new BadRequestException(`Invalid agg "${body.agg}". Allowed: ${[...ALLOWED_AGG].join(', ')}`);
      }
      body.agg = aggUpper;
    }

    // Parse dates
    let startTs: Date | undefined;
    let endTs: Date | undefined;
    if (body.startTs) {
      startTs = new Date(body.startTs);
      if (isNaN(startTs.getTime())) throw new BadRequestException(`Invalid startTs: "${body.startTs}"`);
    }
    if (body.endTs) {
      endTs = new Date(body.endTs);
      if (isNaN(endTs.getTime())) throw new BadRequestException(`Invalid endTs: "${body.endTs}"`);
    }
    if (startTs && endTs && startTs >= endTs) {
      throw new BadRequestException('startTs must be before endTs');
    }

    // Validate exactTime format
    if (body.exactTime && !/^\d{1,2}(:\d{2})?$/.test(body.exactTime)) {
      throw new BadRequestException('exactTime must be HH or HH:MM format, e.g. "11" or "11:00"');
    }

    // Restrict to site if API key is scoped
    const effectiveSiteId = org?.siteId ?? body.siteId;

    // Validate sortBy
    if (body.sortBy && !['time', 'value', 'sensor', 'quality'].includes(body.sortBy)) {
      throw new BadRequestException('sortBy must be one of: time, value, sensor, quality');
    }
    if (body.sortDir && body.sortDir !== 'ASC' && body.sortDir !== 'DESC') {
      throw new BadRequestException('sortDir must be ASC or DESC');
    }

    return this.timescale.advancedSearch({
      organizationId,
      sensorIds: body.sensorIds,
      siteId: effectiveSiteId,
      startTs,
      endTs,
      exactTime: body.exactTime,
      agg: (body.agg as any) ?? 'NONE',
      intervalMs: body.intervalMs,
      aggField: body.aggField ?? 'value',
      sortBy: body.sortBy,
      sortDir: body.sortDir ?? 'DESC',
      minQuality: body.minQuality,
      limit: body.limit,
      offset: body.offset,
      fields: body.fields,
      includeSummaries: body.includeSummaries,
    });
  }

  /**
   * Find readings nearest to a specific timestamp.
   * Useful for "what was the value at exactly 11:00 on April 20?"
   */
  @Post('readings/nearest')
  async nearestReadings(
    @Body() body: {
      sensorIds: string[];
      targetTime: string;
      maxPerSensor?: number;
    },
    @CurrentUser() user?: AuthUser,
    @CurrentOrg() org?: OrgContext,
  ) {
    const organizationId = user?.organizationId ?? org?.organizationId;
    if (!organizationId) throw new UnauthorizedException();
    if (org && !canQuery(org)) {
      throw new UnauthorizedException('API key lacks query permission');
    }

    if (!body.sensorIds || body.sensorIds.length === 0) {
      throw new BadRequestException('sensorIds is required and must not be empty');
    }
    if (!body.targetTime) {
      throw new BadRequestException('targetTime is required (ISO 8601)');
    }
    const target = new Date(body.targetTime);
    if (isNaN(target.getTime())) {
      throw new BadRequestException(`Invalid targetTime: "${body.targetTime}"`);
    }

    const data = await this.timescale.nearestToTime(
      organizationId,
      target,
      body.sensorIds,
      Math.min(body.maxPerSensor ?? 1, 10),
    );

    return { data, meta: { targetTime: body.targetTime, sensorCount: body.sensorIds.length } };
  }
}
