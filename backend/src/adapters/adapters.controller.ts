import {
  Controller, Get, Put, Delete, Post, Body, Param, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { AdaptersService } from './adapters.service';
import { SiteAdapter } from './site-adapter.entity';

@ApiTags('adapters')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('adapters')
export class AdaptersController {
  constructor(private service: AdaptersService) {}

  @Get()
  @Roles('VIEWER')
  findAll(@CurrentUser() user: AuthUser) {
    return this.service.findAll(user.organizationId);
  }

  @Get(':siteId')
  @Roles('VIEWER')
  findOne(@Param('siteId') siteId: string, @CurrentUser() user: AuthUser) {
    return this.service.findOne(siteId, user.organizationId);
  }

  @Put(':siteId')
  @Roles('ADMIN')
  upsert(
    @Param('siteId') siteId: string,
    @Body() body: Partial<SiteAdapter>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.upsert(siteId, user.organizationId, body);
  }

  @Delete(':siteId')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('siteId') siteId: string, @CurrentUser() user: AuthUser) {
    return this.service.delete(siteId, user.organizationId);
  }

  @Post(':siteId/pull/trigger')
  @Roles('ADMIN')
  triggerPull(@Param('siteId') siteId: string, @CurrentUser() user: AuthUser) {
    return this.service.triggerPull(siteId, user.organizationId);
  }
}
