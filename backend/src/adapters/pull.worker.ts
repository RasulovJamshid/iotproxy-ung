import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { randomUUID } from 'crypto';
import { SiteAdapter, PullAuthConfig } from './site-adapter.entity';
import { IngestQueueProducer } from '../ingest/ingest-queue.producer';
import { mapPullResponse, interpolate, interpolateObj } from './response-mapper';
import { IngestJob, QUEUE_NAMES } from '@iotproxy/shared';

@Processor(QUEUE_NAMES.PULL)
@Injectable()
export class PullWorker extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(PullWorker.name);

  constructor(
    @InjectRepository(SiteAdapter) private adapters: Repository<SiteAdapter>,
    private ingest: IngestQueueProducer,
  ) {
    super();
  }

  onModuleInit() {
    // Prevent unhandled rejection from crashing the process when BullMQ
    // emits worker-level errors (e.g. Redis disconnects during job failure).
    this.worker.on('error', (err) => {
      this.logger.error(`PullWorker error: ${err.message}`);
    });
  }

  async process(job: Job<{ adapterId: string }>): Promise<void> {
    const adapter = await this.adapters.findOne({ where: { id: job.data.adapterId } });
    if (!adapter || !adapter.pullUrl || !adapter.responseMapping) {
      this.logger.warn(`Pull adapter ${job.data.adapterId} not found or incomplete`);
      return;
    }

    const now         = new Date().toISOString();
    const lastPollAt  = adapter.pullLastAt?.toISOString() ?? new Date(Date.now() - adapter.pullIntervalSec * 1000).toISOString();
    const templateVars = { now, lastPollAt, siteId: adapter.siteId };

    // Build URL (with optional query params)
    let url = interpolate(adapter.pullUrl, templateVars);
    if (adapter.pullQueryParams && Object.keys(adapter.pullQueryParams).length > 0) {
      const qs = new URLSearchParams(
        Object.fromEntries(
          Object.entries(adapter.pullQueryParams).map(([k, v]) => [k, interpolate(v, templateVars)]),
        ),
      );
      url += (url.includes('?') ? '&' : '?') + qs.toString();
    }

    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...this.interpolateHeaders(adapter.pullHeaders ?? {}, templateVars),
    };
    this.applyAuth(headers, adapter.pullAuthType, adapter.pullAuthConfig);

    // Build body (POST only)
    let body: string | undefined;
    if (adapter.pullMethod === 'POST' && adapter.pullBodyTemplate) {
      body = JSON.stringify(interpolateObj(adapter.pullBodyTemplate, templateVars));
    }

    this.logger.debug(`Pull ${adapter.id}: ${adapter.pullMethod} ${url}`);

    let statusCode = 0;
    try {
      const res = await fetch(url, {
        method: adapter.pullMethod,
        headers,
        body,
        signal: AbortSignal.timeout(30_000),
      });
      statusCode = res.status;

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        this.logger.error(
          `Pull ${adapter.id}: ${adapter.pullMethod} ${url} → ${res.status} ${res.statusText}` +
          (errBody ? `\n${errBody.slice(0, 500)}` : ''),
        );
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      const responseBody = await res.json();

      // Resolve site names → UUIDs for multi-site mode
      const siteNameCache = new Map<string, string>();
      const siteResolver = (name: string): string | undefined => siteNameCache.get(name);
      // (For multi-site by-name, the caller must populate siteNameCache externally;
      //  by-id mode works without this and is the default.)

      const readings = mapPullResponse(responseBody, adapter.responseMapping, siteResolver);

      if (readings.length === 0) {
        this.logger.warn(`Pull ${adapter.id}: response mapped to 0 readings`);
      }

      const batchId = randomUUID();
      const jobs: IngestJob[] = readings.map((r) => ({
        sensorId:       r.sensorId,
        phenomenonTime: r.phenomenonTime,
        data:           r.data,
        organizationId: adapter.organizationId,
        siteId:         r.siteId,
        receivedAt:     now,
        correlationId:  randomUUID(),
        batchId,
        source: 'pull' as const,
      }));

      if (jobs.length > 0) {
        await this.ingest.enqueue(jobs);
        this.logger.log(`Pull ${adapter.id}: enqueued ${jobs.length} readings`);
      }

      await this.adapters.update(adapter.id, {
        pullLastAt: new Date(),
        pullLastStatusCode: statusCode,
        pullLastError: null as any, // explicit NULL — undefined is ignored by TypeORM
      });
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.error(`Pull ${adapter.id} failed: ${msg}`);
      await this.adapters.update(adapter.id, {
        pullLastStatusCode: statusCode,
        pullLastError: msg,
      });
      throw err; // let BullMQ retry
    }
  }

  private interpolateHeaders(
    headers: Record<string, string>,
    vars: Record<string, string>,
  ): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      out[k] = interpolate(v, vars);
    }
    return out;
  }

  private applyAuth(
    headers: Record<string, string>,
    authType: string,
    config?: PullAuthConfig,
  ) {
    if (!config) return;
    switch (authType) {
      case 'apiKey':
        if (config.headerName && config.value) {
          headers[config.headerName] = config.value;
        }
        break;
      case 'bearerToken':
        if (config.value) headers['Authorization'] = `Bearer ${config.value}`;
        break;
      case 'basicAuth':
        if (config.username && config.password) {
          const encoded = Buffer.from(`${config.username}:${config.password}`).toString('base64');
          headers['Authorization'] = `Basic ${encoded}`;
        }
        break;
    }
  }
}
