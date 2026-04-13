import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdapterTemplate } from './adapter-template.entity';

@Injectable()
export class AdapterTemplatesService {
  constructor(
    @InjectRepository(AdapterTemplate)
    private repo: Repository<AdapterTemplate>,
  ) {}

  findAll(organizationId: string): Promise<AdapterTemplate[]> {
    return this.repo.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, organizationId: string): Promise<AdapterTemplate> {
    const tpl = await this.repo.findOne({ where: { id, organizationId } });
    if (!tpl) throw new NotFoundException(`Adapter template ${id} not found`);
    return tpl;
  }

  async create(
    organizationId: string,
    data: Partial<AdapterTemplate>,
  ): Promise<AdapterTemplate> {
    return this.repo.save(this.repo.create({ ...data, organizationId }));
  }

  async update(
    id: string,
    organizationId: string,
    data: Partial<AdapterTemplate>,
  ): Promise<AdapterTemplate> {
    await this.findOne(id, organizationId); // ownership check
    await this.repo.update(id, data as any);
    return this.findOne(id, organizationId);
  }

  async delete(id: string, organizationId: string): Promise<void> {
    await this.findOne(id, organizationId); // ownership check
    await this.repo.delete(id);
  }
}
