import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Site } from './site.entity';

@Injectable()
export class SitesService {
  constructor(
    @InjectRepository(Site) private repo: Repository<Site>,
    private config: ConfigService,
  ) {}

  findAll(organizationId: string) {
    return this.repo.find({ where: { organizationId } });
  }

  async findOne(id: string, organizationId: string) {
    const site = await this.repo.findOne({ where: { id, organizationId } });
    if (!site) throw new NotFoundException(`Site ${id} not found`);
    return site;
  }

  async create(organizationId: string, data: { name: string; description?: string }) {
    const windowHours = this.config.get<number>('discovery.windowHours')!;
    const discoveryWindowEndsAt = new Date(Date.now() + windowHours * 3_600_000);

    return this.repo.save(
      this.repo.create({
        organizationId,
        name: data.name,
        description: data.description,
        commissioningStatus: 'DISCOVERY',
        discoveryWindowEndsAt,
      }),
    );
  }

  async transition(id: string, organizationId: string, status: string) {
    const site = await this.findOne(id, organizationId);

    const allowed: Record<string, string[]> = {
      DISCOVERY: ['REVIEW', 'SUSPENDED'],
      REVIEW: ['ACTIVE', 'DISCOVERY', 'SUSPENDED'],
      ACTIVE: ['SUSPENDED'],
      SUSPENDED: ['ACTIVE'],
    };

    if (!allowed[site.commissioningStatus]?.includes(status)) {
      throw new BadRequestException(
        `Cannot transition from ${site.commissioningStatus} to ${status}`,
      );
    }

    await this.repo.update(id, { commissioningStatus: status });
    return this.findOne(id, organizationId);
  }

  async update(id: string, organizationId: string, data: Partial<Site>) {
    await this.findOne(id, organizationId);
    await this.repo.update(id, data as any);
    return this.findOne(id, organizationId);
  }
}
