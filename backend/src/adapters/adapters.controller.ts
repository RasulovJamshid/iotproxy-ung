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
import { AdapterTemplatesService } from './adapter-templates.service';
import { SiteAdapter } from './site-adapter.entity';

@ApiTags('adapters')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('adapters')
export class AdaptersController {
  constructor(
    private service: AdaptersService,
    private templatesService: AdapterTemplatesService,
  ) {}

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

  /** Snapshot the current adapter config as a named reusable template */
  @Post(':siteId/save-as-template')
  @Roles('ADMIN')
  async saveAsTemplate(
    @Param('siteId') siteId: string,
    @Body() body: { name: string; description?: string },
    @CurrentUser() user: AuthUser,
  ) {
    const adapter = await this.service.findOne(siteId, user.organizationId);
    return this.templatesService.create(user.organizationId, {
      name: body.name,
      description: body.description,
      inboundMapping: adapter.inboundMapping,   // jsonataExpression stored inside
      pullMethod: adapter.pullMethod,
      pullHeaders: adapter.pullHeaders,
      pullQueryParams: adapter.pullQueryParams,
      pullAuthType: adapter.pullAuthType,
      // Only store the header name hint, never the actual secret value
      pullAuthConfig: adapter.pullAuthConfig?.headerName
        ? { headerName: adapter.pullAuthConfig.headerName }
        : undefined,
      pullBodyTemplate: adapter.pullBodyTemplate,
      pullIntervalSec: adapter.pullIntervalSec,
      responseMapping: adapter.responseMapping,  // jsonataExpression stored inside
    });
  }

  /** Apply a saved template onto a site adapter (non-destructive — only overwrites mapping fields) */
  @Post(':siteId/apply-template/:templateId')
  @Roles('ADMIN')
  async applyTemplate(
    @Param('siteId') siteId: string,
    @Param('templateId') templateId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const tpl = await this.templatesService.findOne(templateId, user.organizationId);
    return this.service.upsert(siteId, user.organizationId, {
      inboundMapping: tpl.inboundMapping,
      pullMethod: tpl.pullMethod,
      pullHeaders: tpl.pullHeaders,
      pullQueryParams: tpl.pullQueryParams,
      pullAuthType: tpl.pullAuthType,
      // Apply the header name hint but leave value blank so user fills in credentials
      pullAuthConfig: tpl.pullAuthConfig ?? undefined,
      pullBodyTemplate: tpl.pullBodyTemplate,
      pullIntervalSec: tpl.pullIntervalSec,
      responseMapping: tpl.responseMapping,
    });
  }

  /**
   * Schema discovery: paste a sample JSON response and get back suggested mappings.
   * Handles the common pattern where an array of items represents different
   * sensor/product types for the same site (discriminator pattern).
   */
  @Post('discover')
  @Roles('ADMIN')
  discover(@Body() body: { sample: unknown }) {
    return this.service.discoverSchema(body.sample);
  }

  /**
   * Evaluate a JSONata expression against a sample payload.
   * Returns both the raw expression result and the normalized readings array.
   * Use this to test expressions before saving adapter config.
   */
  @Post('evaluate-jsonata')
  @Roles('ADMIN')
  evaluateJsonata(
    @Body() body: { expression: string; sample: unknown; siteId?: string },
  ) {
    return this.service.evaluateJsonata(body.expression, body.sample, body.siteId);
  }
}
