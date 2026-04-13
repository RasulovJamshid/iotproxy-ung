import {
  Controller, Get, Post, Put, Delete,
  Body, Param, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { AdapterTemplatesService } from './adapter-templates.service';
import { AdapterTemplate } from './adapter-template.entity';

@ApiTags('adapter-templates')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('adapter-templates')
export class AdapterTemplatesController {
  constructor(private service: AdapterTemplatesService) {}

  @Get()
  @Roles('VIEWER')
  findAll(@CurrentUser() user: AuthUser) {
    return this.service.findAll(user.organizationId);
  }

  @Get(':id')
  @Roles('VIEWER')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.findOne(id, user.organizationId);
  }

  @Post()
  @Roles('ADMIN')
  create(
    @Body() body: Partial<AdapterTemplate>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.create(user.organizationId, body);
  }

  @Put(':id')
  @Roles('ADMIN')
  update(
    @Param('id') id: string,
    @Body() body: Partial<AdapterTemplate>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, user.organizationId, body);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.delete(id, user.organizationId);
  }
}
