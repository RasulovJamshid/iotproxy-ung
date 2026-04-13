import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Repository } from 'typeorm';
import { Queue } from 'bullmq';
import { createHmac, randomBytes } from 'crypto';
import { Webhook } from './webhook.entity';
import { QUEUE_NAMES } from '@iotproxy/shared';

export interface WebhookJob {
  url: string;
  signingSecret: string;
  event: string;
  payload: unknown;
  organizationId: string;
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    @InjectRepository(Webhook) private repo: Repository<Webhook>,
    @InjectQueue(QUEUE_NAMES.WEBHOOKS) private queue: Queue,
  ) {}

  async dispatch(organizationId: string, event: string, payload: unknown): Promise<void> {
    const hooks = await this.repo.find({
      where: { organizationId, isActive: true },
    });

    const matching = hooks.filter((h) => h.events.includes(event) || h.events.includes('*'));

    for (const hook of matching) {
      await this.queue.add('dispatch-webhook', {
        url: hook.url,
        signingSecret: hook.signingSecret,
        event,
        payload,
        organizationId,
      } as WebhookJob, {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
      });
    }
  }

  async create(organizationId: string, data: Partial<Webhook>) {
    const signingSecret = randomBytes(32).toString('hex');
    return this.repo.save(
      this.repo.create({ organizationId, signingSecret, ...data }),
    );
  }

  findAll(organizationId: string) {
    return this.repo.find({ where: { organizationId } });
  }

  async revoke(id: string, organizationId: string) {
    await this.repo.update({ id, organizationId }, { isActive: false });
  }

  // Called by WebhookWorker to sign and send the payload
  static buildSignature(secret: string, body: string): string {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const sig = createHmac('sha256', secret)
      .update(`${timestamp}.${body}`)
      .digest('hex');
    return `t=${timestamp},v1=${sig}`;
  }
}
