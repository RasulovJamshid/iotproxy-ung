import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SensorType } from './sensor-type.entity';

@Injectable()
export class SensorTypesService {
  constructor(
    @InjectRepository(SensorType) private types: Repository<SensorType>,
  ) {}

  async findAll(organizationId: string) {
    return this.types.find({
      where: { organizationId, isActive: true },
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string, organizationId: string) {
    const type = await this.types.findOne({ where: { id, organizationId } });
    if (!type) throw new NotFoundException(`Sensor type ${id} not found`);
    return type;
  }

  async create(organizationId: string, data: { name: string; description?: string; icon?: string }) {
    // Check for duplicate name
    const existing = await this.types.findOne({
      where: { organizationId, name: data.name },
    });
    if (existing) {
      throw new ConflictException(`Sensor type with name "${data.name}" already exists`);
    }

    return this.types.save(this.types.create({ organizationId, ...data }));
  }

  async update(id: string, organizationId: string, data: { name?: string; description?: string; icon?: string; isActive?: boolean }) {
    await this.findOne(id, organizationId);
    
    // Check for duplicate name if name is being changed
    if (data.name) {
      const existing = await this.types.findOne({
        where: { organizationId, name: data.name },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException(`Sensor type with name "${data.name}" already exists`);
      }
    }

    await this.types.update(id, data);
    return this.findOne(id, organizationId);
  }

  async delete(id: string, organizationId: string) {
    await this.findOne(id, organizationId);
    await this.types.softDelete(id);
  }
}
