import {
  Controller, Get, Post, Patch, Delete, Body, Param, UseGuards,
  UnauthorizedException, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiSecurity } from '@nestjs/swagger';
import { FlexibleAuthGuard } from '../auth/guards/flexible-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentOrg } from '../auth/decorators/current-org.decorator';
import { AuthUser, OrgContext } from '../auth/interfaces/auth-user.interface';
import { PERMISSIONS } from '@iotproxy/shared';
import { SiteGroupsService } from './site-groups.service';

@ApiTags('site-groups')
@ApiBearerAuth('jwt')
@ApiSecurity('api-key')
@UseGuards(FlexibleAuthGuard)
@Controller('site-groups')
export class SiteGroupsController {
  constructor(private service: SiteGroupsService) {}

  @Get()
  findAll(
    @CurrentUser() user?: AuthUser,
    @CurrentOrg() org?: OrgContext,
  ) {
    const organizationId = user?.organizationId ?? org?.organizationId;
    if (!organizationId) throw new UnauthorizedException();

    if (org && !org.permissions.some(p => ([PERMISSIONS.QUERY, PERMISSIONS.ADMIN] as string[]).includes(p))) {
      throw new UnauthorizedException('API key lacks query permission');
    }

    return this.service.findAll(organizationId);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user?: AuthUser,
    @CurrentOrg() org?: OrgContext,
  ) {
    const organizationId = user?.organizationId ?? org?.organizationId;
    if (!organizationId) throw new UnauthorizedException();

    if (org && !org.permissions.some(p => ([PERMISSIONS.QUERY, PERMISSIONS.ADMIN] as string[]).includes(p))) {
      throw new UnauthorizedException('API key lacks query permission');
    }

    return this.service.findOne(id, organizationId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SYSTEM_ADMIN')
  create(
    @Body() body: { name: string; description?: string; color?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.create(user.organizationId, body);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SYSTEM_ADMIN')
  update(
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string; color?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, user.organizationId, body);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SYSTEM_ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user.organizationId);
  }

  @Patch(':id/sites/:siteId')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SYSTEM_ADMIN')
  assignSite(
    @Param('id') id: string,
    @Param('siteId') siteId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.assignSite(siteId, user.organizationId, id);
  }

  @Delete(':id/sites/:siteId')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SYSTEM_ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  unassignSite(@Param('siteId') siteId: string, @CurrentUser() user: AuthUser) {
    return this.service.assignSite(siteId, user.organizationId, null);
  }
}
