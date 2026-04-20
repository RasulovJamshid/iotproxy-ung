import {
  Injectable, NotFoundException, ConflictException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { SiteGroup } from './site-group.entity';
import { Site } from '../sites/site.entity';

@Injectable()
export class SiteGroupsService {
  constructor(
    @InjectRepository(SiteGroup) private repo: Repository<SiteGroup>,
    @InjectRepository(Site) private sites: Repository<Site>,
    private dataSource: DataSource,
  ) {}

  /** List all groups for an org, each with a siteCount virtual field. */
  async findAll(organizationId: string): Promise<(SiteGroup & { siteCount: number })[]> {
    const groups = await this.repo
      .createQueryBuilder('g')
      .where('g.organizationId = :organizationId', { organizationId })
      .loadRelationCountAndMap('g.siteCount', 'g.sites')
      .orderBy('g.name', 'ASC')
      .getMany();

    return groups as (SiteGroup & { siteCount: number })[];
  }

  /** Single group with its sites list. */
  async findOne(id: string, organizationId: string): Promise<SiteGroup> {
    const group = await this.repo.findOne({
      where: { id, organizationId },
      relations: ['sites'],
    });
    if (!group) throw new NotFoundException(`Site group ${id} not found`);
    return group;
  }

  async create(
    organizationId: string,
    data: { name: string; description?: string; color?: string },
  ): Promise<SiteGroup> {
    const exists = await this.repo.findOne({ where: { organizationId, name: data.name } });
    if (exists) throw new ConflictException(`A group named "${data.name}" already exists`);

    return this.repo.save(
      this.repo.create({ organizationId, ...data }),
    );
  }

  async update(
    id: string,
    organizationId: string,
    data: { name?: string; description?: string; color?: string },
  ): Promise<SiteGroup> {
    const group = await this.findOne(id, organizationId);

    if (data.name && data.name !== group.name) {
      const exists = await this.repo.findOne({ where: { organizationId, name: data.name } });
      if (exists) throw new ConflictException(`A group named "${data.name}" already exists`);
    }

    await this.repo.update(id, data);
    return this.findOne(id, organizationId);
  }

  async remove(id: string, organizationId: string): Promise<void> {
    const group = await this.findOne(id, organizationId);

    // ON DELETE SET NULL handles FK cleanup in DB, but do it explicitly in a
    // transaction so any sites load correctly after the delete.
    await this.dataSource.transaction(async (em) => {
      // Clear groupId on all sites in this group before deleting
      // (the DB ON DELETE SET NULL covers this too, but explicit is safer)
      await em.getRepository(Site).update({ groupId: id }, { groupId: undefined });
      await em.remove(SiteGroup, group);
    });
  }

  /** Assign or unassign a site from a group. Pass null to unassign. */
  async assignSite(
    siteId: string,
    organizationId: string,
    groupId: string | null,
  ): Promise<Site> {
    const site = await this.sites.findOne({ where: { id: siteId, organizationId } });
    if (!site) throw new NotFoundException(`Site ${siteId} not found`);

    if (groupId !== null) {
      const group = await this.repo.findOne({ where: { id: groupId, organizationId } });
      if (!group) throw new NotFoundException(`Site group ${groupId} not found`);
    }

    await this.sites.update(siteId, { groupId: groupId ?? undefined });
    return this.sites.findOne({ where: { id: siteId } }) as Promise<Site>;
  }
}
