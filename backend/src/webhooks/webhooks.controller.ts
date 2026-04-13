import {
  Controller, Get, Post, Patch, Delete, Body, Param,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { WebhookService } from './webhook.service';

@ApiTags('webhooks')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('webhooks')
export class WebhooksController {
  constructor(private service: WebhookService) {}

  @Get()
  @Roles('ADMIN')
  findAll(@CurrentUser() user: AuthUser) {
    return this.service.findAll(user.organizationId);
  }

  @Post()
  @Roles('ADMIN')
  create(@Body() body: { url: string; events: string[] }, @CurrentUser() user: AuthUser) {
    return this.service.create(user.organizationId, body);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(@Param('id') id: string, @Body() body: { url?: string; events?: string[]; isActive?: boolean }, @CurrentUser() user: AuthUser) {
    return this.service.update(id, user.organizationId, body);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.revoke(id, user.organizationId);
  }
}
