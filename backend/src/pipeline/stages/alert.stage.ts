import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Repository } from 'typeorm';
import { Queue } from 'bullmq';
import { AlertRule } from '../../alerts/alert-rule.entity';
import { AlertEvent } from '../../alerts/alert-event.entity';
import { PipelineContext, StageResult } from '../pipeline.types';
import { AlertState, QUEUE_NAMES } from '@iotproxy/shared';
import { NotificationJob } from '../../notifications/notification.worker';

@Injectable()
export class AlertStage {
  private readonly logger = new Logger(AlertStage.name);

  constructor(
    @InjectRepository(AlertRule) private rules: Repository<AlertRule>,
    @InjectRepository(AlertEvent) private events: Repository<AlertEvent>,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS) private notifQueue: Queue,
  ) {}

  async run(ctx: PipelineContext): Promise<StageResult> {
    const rules = await this.rules.find({
      where: { sensorId: ctx.raw.sensorId, isActive: true },
    });

    if (rules.length === 0) return { action: 'PASS' };

    for (const rule of rules) {
      try {
        await this.evaluateRule(rule, ctx);
      } catch (err) {
        this.logger.error(`Alert rule ${rule.id} evaluation failed`, err);
      }
    }

    return { action: 'PASS' };
  }

  private async evaluateRule(rule: AlertRule, ctx: PipelineContext): Promise<void> {
    const val = (ctx.current as Record<string, unknown>)[rule.field];
    if (typeof val !== 'number') return;

    const conditionMet = this.evaluate(val, rule.operator, rule.threshold);

    const lastEvent = await this.events.findOne({
      where: { alertRuleId: rule.id },
      order: { createdAt: 'DESC' },
    });

    const currentState: AlertState = (lastEvent?.state as AlertState) ?? 'INACTIVE';

    if (conditionMet && currentState !== 'FIRING') {
      const event = await this.events.save(
        this.events.create({
          alertRuleId: rule.id,
          sensorId: ctx.raw.sensorId,
          siteId: ctx.raw.siteId,
          organizationId: ctx.raw.organizationId,
          state: 'FIRING' as AlertState,
          value: val,
          threshold: rule.threshold,
          severity: rule.severity,
          correlationId: ctx.correlationId,
        }),
      );
      await this.dispatchNotifications(rule, event.id, 'FIRING', val, ctx);

    } else if (!conditionMet && currentState === 'FIRING') {
      const event = await this.events.save(
        this.events.create({
          alertRuleId: rule.id,
          sensorId: ctx.raw.sensorId,
          siteId: ctx.raw.siteId,
          organizationId: ctx.raw.organizationId,
          state: 'RESOLVED' as AlertState,
          value: val,
          threshold: rule.threshold,
          severity: rule.severity,
          correlationId: ctx.correlationId,
        }),
      );
      await this.dispatchNotifications(rule, event.id, 'RESOLVED', val, ctx);
    }
  }

  private async dispatchNotifications(
    rule: AlertRule,
    alertEventId: string,
    state: 'FIRING' | 'RESOLVED',
    value: number,
    ctx: PipelineContext,
  ): Promise<void> {
    for (const channel of rule.notificationChannels ?? []) {
      if (channel.type === 'email') {
        const job: NotificationJob = {
          type: 'email',
          organizationId: ctx.raw.organizationId,
          alertRuleId: rule.id,
          sensorId: ctx.raw.sensorId,
          siteId: ctx.raw.siteId,
          severity: rule.severity as any,
          state,
          value,
          threshold: rule.threshold,
          field: rule.field,
          operator: rule.operator,
          alertEventId,
          to: channel.target,
        };
        await this.notifQueue.add('notify', job);
      }
    }
  }

  private evaluate(val: number, operator: string, threshold: number): boolean {
    switch (operator) {
      case 'GT':  return val > threshold;
      case 'GTE': return val >= threshold;
      case 'LT':  return val < threshold;
      case 'LTE': return val <= threshold;
      case 'EQ':  return val === threshold;
      case 'NEQ': return val !== threshold;
      default: return false;
    }
  }
}
