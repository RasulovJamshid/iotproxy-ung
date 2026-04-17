import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SensorCategory } from './sensor-category.entity';

@Injectable()
export class SensorCategoriesService {
  constructor(
    @InjectRepository(SensorCategory) private categories: Repository<SensorCategory>,
  ) {}

  async findAll(organizationId: string) {
    return this.categories.find({
      where: { organizationId, isActive: true },
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string, organizationId: string) {
    const category = await this.categories.findOne({ where: { id, organizationId } });
    if (!category) throw new NotFoundException(`Sensor category ${id} not found`);
    return category;
  }

  async create(organizationId: string, data: { name: string; description?: string; color?: string }) {
    // Check for duplicate name
    const existing = await this.categories.findOne({
      where: { organizationId, name: data.name },
    });
    if (existing) {
      throw new ConflictException(`Sensor category with name "${data.name}" already exists`);
    }

    return this.categories.save(this.categories.create({ organizationId, ...data }));
  }

  async update(id: string, organizationId: string, data: { name?: string; description?: string; color?: string; isActive?: boolean }) {
    await this.findOne(id, organizationId);
    
    // Check for duplicate name if name is being changed
    if (data.name) {
      const existing = await this.categories.findOne({
        where: { organizationId, name: data.name },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException(`Sensor category with name "${data.name}" already exists`);
      }
    }

    await this.categories.update(id, data);
    return this.findOne(id, organizationId);
  }

  async delete(id: string, organizationId: string) {
    await this.findOne(id, organizationId);
    await this.categories.softDelete(id);
  }
}
