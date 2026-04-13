import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { OrganizationsService } from './organizations.service';

@ApiTags('organizations')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('organizations')
export class OrganizationsController {
  constructor(private service: OrganizationsService) {}

  // ── Organizations ─────────────────────────────────────────────────────────

  @Get()
  @Roles('SYSTEM_ADMIN')
  findAll() {
    return this.service.findAll();
  }

  /** Get all org memberships for a specific user. SYSTEM_ADMIN only. */
  @Get('members/:userId')
  @Roles('SYSTEM_ADMIN')
  getUserMemberships(@Param('userId') userId: string) {
    return this.service.findUserMemberships(userId);
  }

  @Get(':id')
  @Roles('ADMIN')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const orgId = user.role === 'SYSTEM_ADMIN' ? id : user.organizationId;
    return this.service.findOne(orgId);
  }

  @Post()
  @Roles('SYSTEM_ADMIN')
  create(@Body() body: { name: string; slug: string; rateLimitRpm?: number; rawRetentionDays?: number | null }) {
    return this.service.create(body);
  }

  @Patch(':id')
  @Roles('SYSTEM_ADMIN')
  update(@Param('id') id: string, @Body() body: any) {
    return this.service.update(id, body);
  }

  // ── Users / membership ────────────────────────────────────────────────────

  @Get(':id/users')
  @Roles('ADMIN')
  users(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const orgId = user.role === 'SYSTEM_ADMIN' ? id : user.organizationId;
    return this.service.findUsers(orgId);
  }

  @Post(':id/users')
  @Roles('ADMIN')
  createUser(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() body: { email: string; password: string; role: string },
  ) {
    const orgId = user.role === 'SYSTEM_ADMIN' ? id : user.organizationId;
    if (body.role === 'SYSTEM_ADMIN' && user.role !== 'SYSTEM_ADMIN') {
      throw new ForbiddenException('Cannot assign SYSTEM_ADMIN role');
    }
    return this.service.createUser(orgId, body.email, body.password, body.role);
  }

  /** Add an existing user (by userId) to an org. SYSTEM_ADMIN only. */
  @Post(':id/members')
  @Roles('SYSTEM_ADMIN')
  addMember(
    @Param('id') id: string,
    @Body() body: { userId: string; role: string },
  ) {
    return this.service.addUserToOrg(body.userId, id, body.role);
  }

  /** Update a user's role within a specific org. SYSTEM_ADMIN only. */
  @Patch(':id/members/:userId')
  @Roles('SYSTEM_ADMIN')
  updateMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() body: { role: string },
  ) {
    return this.service.updateMembership(userId, id, body.role);
  }

  /** Remove a user from an org. SYSTEM_ADMIN only. */
  @Delete(':id/members/:userId')
  @Roles('SYSTEM_ADMIN')
  removeMember(@Param('id') id: string, @Param('userId') userId: string) {
    return this.service.removeUserFromOrg(userId, id);
  }

  @Patch(':id/users/:userId')
  @Roles('ADMIN')
  updateUser(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: { role?: string; isActive?: boolean; organizationId?: string; email?: string; password?: string },
  ) {
    const orgId = user.role === 'SYSTEM_ADMIN' ? id : user.organizationId;
    if (body.role === 'SYSTEM_ADMIN' && user.role !== 'SYSTEM_ADMIN') {
      throw new ForbiddenException('Cannot assign SYSTEM_ADMIN role');
    }
    if (body.organizationId && user.role !== 'SYSTEM_ADMIN') {
      throw new ForbiddenException('Cannot reassign user to a different organization');
    }
    return this.service.updateUser(userId, orgId, body);
  }
}
