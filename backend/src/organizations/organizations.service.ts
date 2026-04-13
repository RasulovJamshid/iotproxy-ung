import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Organization } from './organization.entity';
import { User } from './user.entity';
import { UserOrganization } from './user-organization.entity';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization) private orgs: Repository<Organization>,
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(UserOrganization) private memberships: Repository<UserOrganization>,
  ) {}

  // ── Organizations ────────────────────────────────────────────────────────

  findAll() {
    return this.orgs.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string) {
    const org = await this.orgs.findOne({ where: { id } });
    if (!org) throw new NotFoundException(`Organization ${id} not found`);
    return org;
  }

  async create(data: { name: string; slug: string; rateLimitRpm?: number; rawRetentionDays?: number | null }) {
    return this.orgs.save(this.orgs.create(data as any));
  }

  async update(id: string, data: Partial<Organization>) {
    await this.findOne(id);
    await this.orgs.update(id, data as any);
    return this.findOne(id);
  }

  // ── User membership ──────────────────────────────────────────────────────

  /** All users who are members of this org (via user_organizations join table). */
  async findUsers(orgId: string) {
    const rows = await this.memberships.find({ where: { organizationId: orgId } });
    if (!rows.length) return [];
    const userIds = rows.map((r) => r.userId);

    const users = await this.users
      .createQueryBuilder('u')
      .select(['u.id', 'u.email', 'u.organizationId', 'u.isActive', 'u.createdAt'])
      .whereInIds(userIds)
      .getMany();

    // Merge per-org role from join table onto each user
    const roleMap = new Map(rows.map((r) => [r.userId, r.role]));
    return users.map((u) => ({ ...u, role: roleMap.get(u.id) ?? 'USER' }));
  }

  /** All org memberships for a given user (used by auth switch-org flow). */
  async findUserMemberships(userId: string): Promise<Array<{ org: Organization; role: string }>> {
    const rows = await this.memberships.find({ where: { userId } });
    if (!rows.length) return [];
    const orgs = await this.orgs.findByIds(rows.map((r) => r.organizationId));
    const roleMap = new Map(rows.map((r) => [r.organizationId, r.role]));
    return orgs.map((org) => ({ org, role: roleMap.get(org.id) ?? 'USER' }));
  }

  /** Effective role for a user in a specific org. Returns null if not a member. */
  async getMemberRole(userId: string, orgId: string): Promise<string | null> {
    const row = await this.memberships.findOne({ where: { userId, organizationId: orgId } });
    return row?.role ?? null;
  }

  /** Create a new user and add them to the org. */
  async createUser(orgId: string, email: string, password: string, role: string) {
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.users.save(
      this.users.create({ organizationId: orgId, email, passwordHash, role: 'USER' }),
    );
    await this.memberships.save(
      this.memberships.create({ userId: user.id, organizationId: orgId, role }),
    );
    const { passwordHash: _ph, ...safe } = user as any;
    return { ...safe, role };
  }

  /** Update the role for an existing membership without moving the user. */
  async updateMembership(userId: string, orgId: string, role: string) {
    const row = await this.memberships.findOne({ where: { userId, organizationId: orgId } });
    if (!row) throw new NotFoundException('Membership not found');
    await this.memberships.update({ userId, organizationId: orgId }, { role });
    const org = await this.findOne(orgId);
    return { orgId, orgName: org.name, role };
  }

  /** Add an existing user to an org. */
  async addUserToOrg(userId: string, orgId: string, role: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException(`User ${userId} not found`);
    await this.findOne(orgId);
    const existing = await this.memberships.findOne({ where: { userId, organizationId: orgId } });
    if (existing) throw new BadRequestException('User is already a member of this organization');
    await this.memberships.save(this.memberships.create({ userId, organizationId: orgId, role }));
    return this.getMemberRole(userId, orgId);
  }

  /** Remove a user from an org. */
  async removeUserFromOrg(userId: string, orgId: string) {
    const row = await this.memberships.findOne({ where: { userId, organizationId: orgId } });
    if (!row) throw new NotFoundException('Membership not found');
    await this.memberships.delete({ userId, organizationId: orgId });
  }

  /** Update per-org role, active status, email, password, or org reassignment. */
  async updateUser(
    userId: string,
    orgId: string,
    data: { role?: string; isActive?: boolean; organizationId?: string; email?: string; password?: string },
  ) {
    const { organizationId: newOrgId, role, isActive, email, password } = data;

    const userUpdates: Partial<User> = {};
    if (isActive !== undefined) userUpdates.isActive = isActive;
    if (email) userUpdates.email = email;
    if (password) userUpdates.passwordHash = await bcrypt.hash(password, 10);
    if (Object.keys(userUpdates).length) await this.users.update(userId, userUpdates);

    if (role !== undefined) {
      await this.memberships.upsert(
        { userId, organizationId: orgId, role },
        ['userId', 'organizationId'],
      );
    }

    if (newOrgId && newOrgId !== orgId) {
      await this.memberships.delete({ userId, organizationId: orgId });
      await this.memberships.save(
        this.memberships.create({ userId, organizationId: newOrgId, role: role ?? 'USER' }),
      );
      await this.users.update(userId, { organizationId: newOrgId });
    }

    const effectiveOrgId = newOrgId ?? orgId;
    const user = await this.users.findOne({
      select: ['id', 'organizationId', 'email', 'isActive', 'createdAt'],
      where: { id: userId },
    });
    if (!user) throw new NotFoundException(`User ${userId} not found`);
    const membership = await this.memberships.findOne({ where: { userId, organizationId: effectiveOrgId } });
    return { ...user, role: membership?.role ?? 'USER' };
  }
}
