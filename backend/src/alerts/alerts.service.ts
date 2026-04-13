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
    await this.rules.delete(id);
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

  async findEvent(id: string, organizationId: string) {
    const ev = await this.events.findOne({ where: { id, organizationId } });
    if (!ev) throw new NotFoundException(`Alert event ${id} not found`);
    return ev;
  }

  async updateEventState(id: string, organizationId: string, state: string) {
    await this.findEvent(id, organizationId);
    await this.events.update(id, { state });
    return this.findEvent(id, organizationId);
  }

  async deleteEvent(id: string, organizationId: string) {
    await this.findEvent(id, organizationId);
    await this.events.delete(id);
  }
}
