import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FlexibleAuthGuard } from '../auth/guards/flexible-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentOrg } from '../auth/decorators/current-org.decorator';
import { AuthUser, OrgContext } from '../auth/interfaces/auth-user.interface';
import { SensorCategoriesService } from './sensor-categories.service';

@ApiTags('sensor-categories')
@Controller('sensor-categories')
@UseGuards(FlexibleAuthGuard)
export class SensorCategoriesController {
  constructor(private service: SensorCategoriesService) {}

  @Get()
  findAll(
    @CurrentUser() user?: AuthUser,
    @CurrentOrg() org?: OrgContext,
  ) {
    const organizationId = user?.organizationId ?? org?.organizationId;
    if (!organizationId) throw new UnauthorizedException();
    
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
    
    return this.service.findOne(id, organizationId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @Body() body: { name: string; description?: string; color?: string },
    @CurrentUser() user?: AuthUser,
  ) {
    const organizationId = user?.organizationId;
    if (!organizationId) throw new UnauthorizedException();
    
    if (user.role !== 'ADMIN' && user.role !== 'SYSTEM_ADMIN') {
      throw new UnauthorizedException('Insufficient permissions');
    }
    
    return this.service.create(organizationId, body);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string; color?: string; isActive?: boolean },
    @CurrentUser() user?: AuthUser,
  ) {
    const organizationId = user?.organizationId;
    if (!organizationId) throw new UnauthorizedException();
    
    if (user.role !== 'ADMIN' && user.role !== 'SYSTEM_ADMIN') {
      throw new UnauthorizedException('Insufficient permissions');
    }
    
    return this.service.update(id, organizationId, body);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async delete(
    @Param('id') id: string,
    @CurrentUser() user?: AuthUser,
  ) {
    const organizationId = user?.organizationId;
    if (!organizationId) throw new UnauthorizedException();
    
    if (user.role !== 'ADMIN' && user.role !== 'SYSTEM_ADMIN') {
      throw new UnauthorizedException('Insufficient permissions');
    }
    
    await this.service.delete(id, organizationId);
    return { message: 'Sensor category deleted' };
  }
}
