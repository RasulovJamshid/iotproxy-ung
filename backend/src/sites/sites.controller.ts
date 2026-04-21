import {
  Controller, Get, Post, Patch, Body, Param, Query, UseGuards, UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiSecurity, ApiQuery } from '@nestjs/swagger';
import { FlexibleAuthGuard } from '../auth/guards/flexible-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentOrg } from '../auth/decorators/current-org.decorator';
import { AuthUser, OrgContext } from '../auth/interfaces/auth-user.interface';
import { PERMISSIONS } from '@iotproxy/shared';
import { canRead } from '../auth/permission.helpers';
import { SitesService } from './sites.service';

@ApiTags('sites')
@ApiBearerAuth('jwt')
@ApiSecurity('api-key')
@UseGuards(FlexibleAuthGuard)
@Controller('sites')
export class SitesController {
  constructor(private service: SitesService) {}

  @Get()
  @ApiQuery({ name: 'orgId', required: false, description: 'Organization ID (SYSTEM_ADMIN only)' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 50, max: 500)' })
  @ApiQuery({ 
    name: 'groupId', 
    required: false, 
    description: 'Filter by site group. Use "none" for ungrouped sites, a UUID for a specific group, or omit to get all sites.' 
  })
  async findAll(
    @Query('orgId') orgIdParam?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('groupId') groupId?: string,
    @CurrentUser() user?: AuthUser,
    @CurrentOrg() org?: OrgContext,
  ) {
    let organizationId = user?.organizationId ?? org?.organizationId;
    if (!organizationId) throw new UnauthorizedException();

    // SYSTEM_ADMIN may request sites for any org via ?orgId=
    if (orgIdParam && user?.role === 'SYSTEM_ADMIN') {
      organizationId = orgIdParam;
    }

    if (org && !canRead(org)) {
      throw new UnauthorizedException('API key lacks read permission');
    }

    // API key scoped to a single site — return only that site
    if (org?.siteId) {
      const site = await this.service.findOne(org.siteId, organizationId);
      return { data: [site], total: 1, page: 1, limit: 1, totalPages: 1 };
    }
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? Math.min(parseInt(limit, 10), 500) : 50;
    // groupId='none' → ungrouped only; a UUID → filter by that group; absent → all
    const resolvedGroupId =
      groupId === 'none' ? null
      : groupId            ? groupId
      : undefined;
    return this.service.findAll(organizationId, pageNum, limitNum, resolvedGroupId);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user?: AuthUser,
    @CurrentOrg() org?: OrgContext,
  ) {
    const organizationId = user?.organizationId ?? org?.organizationId;
    if (!organizationId) throw new UnauthorizedException();
    
    if (org && !canRead(org)) {
      throw new UnauthorizedException('API key lacks read permission');
    }
    
    return this.service.findOne(id, organizationId);
  }

  @Post()
  create(
    @Body() body: {
      name: string;
      description?: string;
      groupId?: string;
      siteType?: string;
      latitude?: number;
      longitude?: number;
      timezone?: string;
      tags?: string[];
      metadata?: Record<string, unknown>;
      customFields?: Record<string, unknown>;
    },
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
    
    return this.service.create(organizationId, body);
  }

  @Patch(':id/status')
  transition(
    @Param('id') id: string,
    @Body('status') status: string,
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
    
    return this.service.transition(id, organizationId, status);
  }

  @Patch(':id/transfer')
  transfer(
    @Param('id') id: string,
    @Body('newOrgId') newOrgId: string,
    @CurrentUser() user?: AuthUser,
  ) {
    // Only SYSTEM_ADMIN can move a site across organizations
    if (!user || user.role !== 'SYSTEM_ADMIN') {
      throw new UnauthorizedException('Only system administrators can transfer sites between organizations');
    }
    return this.service.transfer(id, newOrgId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: any,
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
    
    return this.service.update(id, organizationId, body);
  }
}
