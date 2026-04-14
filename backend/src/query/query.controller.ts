import {
  Controller, Get, Delete, Param, Query, UseGuards, ParseUUIDPipe, UnauthorizedException, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiSecurity, ApiQuery } from '@nestjs/swagger';
import { FlexibleAuthGuard } from '../auth/guards/flexible-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentOrg } from '../auth/decorators/current-org.decorator';
import { AuthUser, OrgContext } from '../auth/interfaces/auth-user.interface';
import { PERMISSIONS } from '@iotproxy/shared';
import { TimescaleRepository } from '../database/timescale.repository';
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
  @ApiQuery({ name: 'startTs', type: String })
  @ApiQuery({ name: 'endTs', type: String })
  @ApiQuery({ name: 'agg', enum: ['AVG','MIN','MAX','SUM','COUNT','NONE'], required: false })
  @ApiQuery({ name: 'intervalMs', type: Number, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiQuery({ name: 'cursor', type: String, required: false })
  async getReadings(
    @Param('sensorId', ParseUUIDPipe) sensorId: string,
    @Query('startTs') startTs: string,
    @Query('endTs') endTs: string,
    @Query('agg') agg: string = 'NONE',
    @Query('intervalMs') intervalMs?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @CurrentUser() user?: AuthUser,
    @CurrentOrg() org?: OrgContext,
  ) {
    const organizationId = user?.organizationId ?? org?.organizationId;
    if (!organizationId) throw new UnauthorizedException();
    
    // API key must have 'read', 'query', or 'admin' permission
    if (org && !org.permissions.some(p => [PERMISSIONS.QUERY, PERMISSIONS.ADMIN, 'read'].includes(p))) {
      throw new UnauthorizedException('API key lacks read permission');
    }
    
    // Verify sensor belongs to org (and site if API key is site-scoped)
    const sensor = await this.sensors.findOne(sensorId, organizationId);
    if (org?.siteId && sensor.siteId !== org.siteId) {
      throw new UnauthorizedException('Sensor not accessible with this API key');
    }

    return this.timescale.queryTimeSeries({
      sensorId,
      startTs: new Date(startTs),
      endTs: new Date(endTs),
      agg: agg as any,
      intervalMs: intervalMs ? parseInt(intervalMs) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      cursor: cursor ? new Date(cursor) : undefined,
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
