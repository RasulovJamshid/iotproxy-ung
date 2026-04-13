import {
  Controller, Get, Post, Body, Param, UseGuards, Res, StreamableFile,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { ExportService } from './export.service';

@ApiTags('export')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('export')
export class ExportController {
  constructor(private service: ExportService) {}

  @Post()
  @Roles('USER')
  create(
    @Body() body: { siteId: string; startTs: string; endTs: string; format: string; fields?: string[] },
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.create(user.organizationId, body);
  }

  @Get(':id/download')
  @Roles('USER')
  async download(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { file, filename, contentType } = await this.service.download(id, user.organizationId);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', contentType);
    return file;
  }

  @Get(':id')
  @Roles('USER')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.findOne(id, user.organizationId);
  }

  @Get()
  @Roles('USER')
  findAll(@CurrentUser() user: AuthUser) {
    return this.service.findAll(user.organizationId);
  }
}
