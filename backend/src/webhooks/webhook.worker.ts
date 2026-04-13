import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '@iotproxy/shared';
import { WebhookJob, WebhookService } from './webhook.service';

@Processor(QUEUE_NAMES.WEBHOOKS)
@Injectable()
export class WebhookWorker extends WorkerHost {
  private readonly logger = new Logger(WebhookWorker.name);

  async process(job: Job<WebhookJob>): Promise<void> {
    const { url, signingSecret, event, payload } = job.data;
    const body = JSON.stringify({ event, payload, deliveredAt: new Date().toISOString() });
    const signature = WebhookService.buildSignature(signingSecret, body);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-IoT-Signature': signature,
        'X-IoT-Event': event,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`Webhook ${url} responded ${response.status}`);
    }

    this.logger.debug(`Webhook delivered: ${event} → ${url}`);
  }
}
