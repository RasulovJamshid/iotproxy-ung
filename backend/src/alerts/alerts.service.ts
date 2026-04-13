import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AlertRule } from './alert-rule.entity';
import { AlertEvent } from './alert-event.entity';

@Injectable()
export class AlertsService {
  constructor(
    @InjectRepository(AlertRule) private rules: Repository<AlertRule>,
    @InjectRepository(AlertEvent) private events: Repository<AlertEvent>,
  ) {}

  findRules(organizationId: string) {
    return this.rules.find({ where: { organizationId } });
  }

  async findRule(id: string, organizationId: string) {
    const rule = await this.rules.findOne({ where: { id, organizationId } });
    if (!rule) throw new NotFoundException(`Alert rule ${id} not found`);
    return rule;
  }

  createRule(organizationId: string, data: Partial<AlertRule>) {
    return this.rules.save(this.rules.create({ organizationId, ...data }));
  }

  async updateRule(id: string, organizationId: string, data: Partial<AlertRule>) {
    await this.findRule(id, organizationId);
    await this.rules.update(id, data);
    return this.findRule(id, organizationId);
  }

  async deleteRule(id: string, organizationId: string) {
    await this.findRule(id, organizationId);
    await this.rules.update(id, { isActive: false });
  }

  getEvents(organizationId: string, sensorId?: string) {
    const where: any = { organizationId };
    if (sensorId) where.sensorId = sensorId;
    return this.events.find({
      where,
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }
}
