import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../organizations/user.entity';
import { UserOrganization } from '../organizations/user-organization.entity';
import { Organization } from '../organizations/organization.entity';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(UserOrganization) private memberships: Repository<UserOrganization>,
    @InjectRepository(Organization) private orgs: Repository<Organization>,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.users.findOne({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }

    // Determine active org and effective role
    const { orgId, role } = await this.resolveOrgContext(user);
    return this.issueTokens(user, orgId, role);
  }

  async refresh(userId: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const { orgId, role } = await this.resolveOrgContext(user);
    return this.issueTokens(user, orgId, role);
  }

  /** Returns all orgs a user is a member of, with their per-org role. */
  async getMyOrgs(userId: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    const rows = await this.memberships.find({ where: { userId } });
    if (!rows.length) return [];

    const orgsList = await this.orgs.findByIds(rows.map((r) => r.organizationId));
    const roleMap = new Map(rows.map((r) => [r.organizationId, r.role]));
    return orgsList.map((org) => ({
      id: org.id,
      name: org.name,
      slug: org.slug,
      isActive: org.isActive,
      role: user.role === 'SYSTEM_ADMIN' ? 'ADMIN' : (roleMap.get(org.id) ?? 'USER'),
    }));
  }

  /** Switch to a different org context — re-issues tokens with the new org's role. */
  async switchOrg(userId: string, orgId: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    // SYSTEM_ADMIN can switch to any org; others must be a member
    if (user.role !== 'SYSTEM_ADMIN') {
      const membership = await this.memberships.findOne({ where: { userId, organizationId: orgId } });
      if (!membership) throw new ForbiddenException('Not a member of this organization');
    }

    // Persist the active org so refresh tokens also use it
    await this.users.update(userId, { organizationId: orgId });

    const effectiveRole = await this.getEffectiveRole(user, orgId);
    return this.issueTokens(user, orgId, effectiveRole);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /** Pick the best org context for a user at login time. */
  private async resolveOrgContext(user: User): Promise<{ orgId: string; role: string }> {
    if (user.role === 'SYSTEM_ADMIN') {
      // SYSTEM_ADMIN: use their saved active org, or first available
      if (user.organizationId) {
        return { orgId: user.organizationId, role: 'SYSTEM_ADMIN' };
      }
      const first = await this.orgs.findOne({ where: { isActive: true } });
      if (first) {
        await this.users.update(user.id, { organizationId: first.id });
        return { orgId: first.id, role: 'SYSTEM_ADMIN' };
      }
      throw new UnauthorizedException('No organizations available');
    }

    // Regular user: use saved active org if still a member, else first membership
    if (user.organizationId) {
      const membership = await this.memberships.findOne({
        where: { userId: user.id, organizationId: user.organizationId },
      });
      if (membership) return { orgId: user.organizationId, role: membership.role };
    }

    const first = await this.memberships.findOne({ where: { userId: user.id } });
    if (first) {
      await this.users.update(user.id, { organizationId: first.organizationId });
      return { orgId: first.organizationId, role: first.role };
    }

    throw new UnauthorizedException('User has no organization membership');
  }

  private async getEffectiveRole(user: User, orgId: string): Promise<string> {
    if (user.role === 'SYSTEM_ADMIN') return 'SYSTEM_ADMIN';
    const membership = await this.memberships.findOne({ where: { userId: user.id, organizationId: orgId } });
    return membership?.role ?? 'USER';
  }

  private issueTokens(user: User, orgId: string, role: string) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      orgId,
      role,
    };

    const accessToken = this.jwt.sign(payload, {
      secret: this.config.get('jwt.secret'),
      expiresIn: this.config.get('jwt.expiresIn'),
    });

    const refreshToken = this.jwt.sign(payload, {
      secret: this.config.get('jwt.refreshSecret'),
      expiresIn: this.config.get('jwt.refreshExpiresIn'),
    });

    return { accessToken, refreshToken };
  }
}
