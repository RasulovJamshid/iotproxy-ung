import {
  Controller, Get, Post, Patch, Delete, Body, Param, UseGuards,
  UnauthorizedException, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FlexibleAuthGuard } from '../auth/guards/flexible-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { SiteGroupsService } from './site-groups.service';

@ApiTags('site-groups')
@ApiBearerAuth('jwt')
@UseGuards(FlexibleAuthGuard, RolesGuard)
@Controller('site-groups')
export class SiteGroupsController {
  constructor(private service: SiteGroupsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.service.findAll(user.organizationId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.findOne(id, user.organizationId);
  }

  @Post()
  @Roles('ADMIN', 'SYSTEM_ADMIN')
  create(
    @Body() body: { name: string; description?: string; color?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.create(user.organizationId, body);
  }

  @Patch(':id')
  @Roles('ADMIN', 'SYSTEM_ADMIN')
  update(
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string; color?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, user.organizationId, body);
  }

  @Delete(':id')
  @Roles('ADMIN', 'SYSTEM_ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user.organizationId);
  }

  /** Assign or unassign a site. Body: { groupId: string | null } */
  @Patch(':id/sites/:siteId')
  @Roles('ADMIN', 'SYSTEM_ADMIN')
  assignSite(
    @Param('id') id: string,
    @Param('siteId') siteId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.assignSite(siteId, user.organizationId, id);
  }

  @Delete(':id/sites/:siteId')
  @Roles('ADMIN', 'SYSTEM_ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  unassignSite(@Param('siteId') siteId: string, @CurrentUser() user: AuthUser) {
    return this.service.assignSite(siteId, user.organizationId, null);
  }
}
