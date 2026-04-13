import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { DiscoveryService } from './discovery.service';

@ApiTags('discovery')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('discovery')
export class DiscoveryController {
  constructor(private service: DiscoveryService) {}

  @Get('sites/:siteId/profiles')
  @Roles('VIEWER')
  getProfiles(@Param('siteId') siteId: string) {
    return this.service.getFieldProfiles(siteId);
  }

  @Post('sites/:siteId/preview')
  @Roles('ADMIN')
  preview(
    @Param('siteId') siteId: string,
    @Body() proposedConfig: Record<string, unknown>,
  ) {
    return this.service.previewConfig(siteId, proposedConfig);
  }
}
