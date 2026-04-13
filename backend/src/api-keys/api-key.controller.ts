import {
  Controller, Get, Post, Patch, Delete, Body, Param,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiKeyService } from './api-key.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { AuthUser } from '../auth/interfaces/auth-user.interface';

@ApiTags('api-keys')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api-keys')
export class ApiKeyController {
  constructor(private service: ApiKeyService) {}

  @Get()
  @Roles('ADMIN', 'USER')
  list(@CurrentUser() user: AuthUser) {
    return this.service.findByOrg(user.organizationId);
  }

  @Post()
  @Roles('ADMIN')
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateApiKeyDto,
  ) {
    const { key, apiKey } = await this.service.generate(user.organizationId, {
      name: dto.name,
      siteId: dto.siteId,
      permissions: dto.permissions,
      websocketEnabled: dto.websocketEnabled,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
    });
    // key is shown once — include in response, never stored in plaintext
    return { ...apiKey, key };
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(
    @Param('id') id: string,
    @Body() body: { name?: string; permissions?: string[]; expiresAt?: string; websocketEnabled?: boolean },
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, user.organizationId, {
      name: body.name,
      permissions: body.permissions,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
      websocketEnabled: body.websocketEnabled,
    });
  }

  @Patch(':id/revoke')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.revoke(id, user.organizationId);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.deleteKey(id, user.organizationId);
  }
}
