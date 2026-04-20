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

    // Calculate time parameters if enabled
    const timeParams = adapter.pullTimeParams?.enabled 
      ? this.calculateTimeParams(adapter.pullTimeParams, now, lastPollAt, adapter.pullIntervalSec)
      : {};

    // Build URL (with optional query params)
    let url = interpolate(adapter.pullUrl, templateVars);
    const queryParams = { ...adapter.pullQueryParams };
    
    // Add time params to query if location is 'query'
    if (adapter.pullTimeParams?.enabled && adapter.pullTimeParams.location === 'query') {
      Object.assign(queryParams, timeParams);
    }
    
    if (queryParams && Object.keys(queryParams).length > 0) {
      const qs = new URLSearchParams(
        Object.fromEntries(
          Object.entries(queryParams).map(([k, v]) => [k, interpolate(String(v), templateVars)]),
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
      let bodyObj = interpolateObj(adapter.pullBodyTemplate, templateVars);
      // Add time params to body if location is 'body'
      if (adapter.pullTimeParams?.enabled && adapter.pullTimeParams.location === 'body') {
        bodyObj = { ...bodyObj, ...timeParams };
      }
      body = JSON.stringify(bodyObj);
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

      const readings = await mapPullResponse(responseBody, adapter.responseMapping, siteResolver);

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

  private calculateTimeParams(
    config: any,
    nowIso: string,
    lastPollIso: string,
    intervalSec: number,
  ): Record<string, string> {
    const result: Record<string, string> = {};
    const nowMs = new Date(nowIso).getTime();
    const lastPollMs = new Date(lastPollIso).getTime();

    // Calculate start time
    if (config.startTime) {
      const startMs = this.calculateTimeValue(config.startTime, nowMs, lastPollMs, intervalSec);
      const startParamName = config.startParamName || 'startTime';
      result[startParamName] = this.formatTime(startMs, config.format, config.customFormat);
    }

    // Calculate end time
    if (config.endTime) {
      const endMs = this.calculateTimeValue(config.endTime, nowMs, lastPollMs, intervalSec);
      const endParamName = config.endParamName || 'endTime';
      result[endParamName] = this.formatTime(endMs, config.format, config.customFormat);
    }

    return result;
  }

  private calculateTimeValue(
    timeConfig: any,
    nowMs: number,
    lastPollMs: number,
    intervalSec: number,
  ): number {
    switch (timeConfig.mode) {
      case 'relative':
        // Offset in seconds from now
        const offsetMs = (timeConfig.relativeOffset || 0) * 1000;
        return nowMs + offsetMs;

      case 'absolute':
        // Fixed timestamp
        return new Date(timeConfig.absoluteValue || nowMs).getTime();

      case 'expression':
        // JSONata expression evaluation
        // For now, support simple expressions via eval (in production, use a proper JSONata library)
        try {
          const $now = nowMs;
          const $lastPoll = lastPollMs;
          const $intervalSec = intervalSec;
          // Simple eval for basic expressions like "$now - 3600000" or "$lastPoll"
          // In production, replace with proper JSONata evaluation
          const expr = timeConfig.expression
            .replace(/\$now/g, String($now))
            .replace(/\$lastPoll/g, String($lastPoll))
            .replace(/\$intervalSec/g, String($intervalSec));
          // eslint-disable-next-line no-eval
          return Number(eval(expr));
        } catch (err) {
          this.logger.warn(`Failed to evaluate time expression: ${timeConfig.expression}`);
          return nowMs;
        }

      default:
        return nowMs;
    }
  }

  private formatTime(timestampMs: number, format: string, customFormat?: string): string {
    const date = new Date(timestampMs);

    switch (format) {
      case 'iso8601':
        return date.toISOString();

      case 'unix_ms':
        return String(timestampMs);

      case 'unix_s':
        return String(Math.floor(timestampMs / 1000));

      case 'custom':
        // Simple custom format support (YYYY-MM-DD HH:mm:ss)
        if (customFormat) {
          return customFormat
            .replace('YYYY', String(date.getUTCFullYear()))
            .replace('MM', String(date.getUTCMonth() + 1).padStart(2, '0'))
            .replace('DD', String(date.getUTCDate()).padStart(2, '0'))
            .replace('HH', String(date.getUTCHours()).padStart(2, '0'))
            .replace('mm', String(date.getUTCMinutes()).padStart(2, '0'))
            .replace('ss', String(date.getUTCSeconds()).padStart(2, '0'));
        }
        return date.toISOString();

      default:
        return date.toISOString();
    }
  }
}
