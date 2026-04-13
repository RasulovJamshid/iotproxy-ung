import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { IngestJob, QUEUE_NAMES } from '@iotproxy/shared';

@Injectable()
export class IngestQueueProducer {
  constructor(
    @InjectQueue(QUEUE_NAMES.READINGS) private queue: Queue,
  ) {}

  async enqueue(jobs: IngestJob[]): Promise<void> {
    await this.queue.addBulk(
      jobs.map((job) => ({
        name: 'process-reading',
        data: job,
        opts: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: { count: 1000 },
          removeOnFail: false, // keep failed jobs for dead-letter review
        },
      })),
    );
  }
}
