import {
  Controller, Get, Post, Patch, Body, Param, Query, UseGuards, UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiSecurity } from '@nestjs/swagger';
import { FlexibleAuthGuard } from '../auth/guards/flexible-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentOrg } from '../auth/decorators/current-org.decorator';
import { AuthUser, OrgContext } from '../auth/interfaces/auth-user.interface';
import { PERMISSIONS } from '@iotproxy/shared';
import { SitesService } from './sites.service';

@ApiTags('sites')
@ApiBearerAuth('jwt')
@ApiSecurity('api-key')
@UseGuards(FlexibleAuthGuard)
@Controller('sites')
export class SitesController {
  constructor(private service: SitesService) {}

  @Get()
  async findAll(
    @Query('orgId') orgIdParam?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @CurrentUser() user?: AuthUser,
    @CurrentOrg() org?: OrgContext,
  ) {
    let organizationId = user?.organizationId ?? org?.organizationId;
    if (!organizationId) throw new UnauthorizedException();

    // SYSTEM_ADMIN may request sites for any org via ?orgId=
    if (orgIdParam && user?.role === 'SYSTEM_ADMIN') {
      organizationId = orgIdParam;
    }

    // API key must have 'read', 'query', or 'admin' permission
    if (org && !org.permissions.some(p => [PERMISSIONS.QUERY, PERMISSIONS.ADMIN, 'read'].includes(p))) {
      throw new UnauthorizedException('API key lacks read permission');
    }

    // API key scoped to a single site — return only that site
    if (org?.siteId) {
      const site = await this.service.findOne(org.siteId, organizationId);
      return { data: [site], total: 1, page: 1, limit: 1, totalPages: 1 };
    }
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? Math.min(parseInt(limit, 10), 500) : 50;
    return this.service.findAll(organizationId, pageNum, limitNum);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user?: AuthUser,
    @CurrentOrg() org?: OrgContext,
  ) {
    const organizationId = user?.organizationId ?? org?.organizationId;
    if (!organizationId) throw new UnauthorizedException();
    
    // API key must have 'read', 'query', or 'admin' permission
    if (org && !org.permissions.some(p => [PERMISSIONS.QUERY, PERMISSIONS.ADMIN, 'read'].includes(p))) {
      throw new UnauthorizedException('API key lacks read permission');
    }
    
    return this.service.findOne(id, organizationId);
  }

  @Post()
  create(
    @Body() body: { name: string; description?: string },
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
