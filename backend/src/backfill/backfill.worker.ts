import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { randomUUID } from 'crypto';
import { BackfillRun } from './backfill-run.entity';
import { SiteAdapter, PullAuthConfig } from '../adapters/site-adapter.entity';
import { IngestQueueProducer } from '../ingest/ingest-queue.producer';
import { mapPullResponse, MappedReading, interpolate, interpolateObj } from '../adapters/response-mapper';
import { IngestJob, QUEUE_NAMES, BackfillChunkJob, BackfillTimestampStrategy, BackfillTimeParams } from '@iotproxy/shared';

@Processor(QUEUE_NAMES.BACKFILL, { concurrency: 2 })
@Injectable()
export class BackfillWorker extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(BackfillWorker.name);

  constructor(
    @InjectRepository(BackfillRun)  private runs: Repository<BackfillRun>,
    @InjectRepository(SiteAdapter)  private adapters: Repository<SiteAdapter>,
    private ingest: IngestQueueProducer,
  ) {
    super();
  }

  onModuleInit() {
    this.worker.on('error', (err) => {
      this.logger.error(`BackfillWorker error: ${err.message}`);
    });
  }

  async process(job: Job<BackfillChunkJob>): Promise<void> {
    const { runId, adapterId, organizationId, windowStart, windowEnd, chunkIndex, totalChunks } = job.data;
    const timestampStrategy = job.data.timestampStrategy as BackfillTimestampStrategy;

    // Skip if run was cancelled between enqueue and execution.
    const run = await this.runs.findOne({ where: { id: runId } });
    if (!run || run.status === 'CANCELLED') {
      this.logger.log(`Backfill run ${runId} cancelled — skipping chunk ${chunkIndex}/${totalChunks}`);
      return;
    }

    const adapter = await this.adapters.findOne({ where: { id: adapterId } });
    if (!adapter || !adapter.pullUrl || !adapter.responseMapping) {
      throw new Error(`Adapter ${adapterId} not found or missing pull config`);
    }

    const winStart = new Date(windowStart);
    const winEnd   = new Date(windowEnd);
    const pad = (n: number) => String(n).padStart(2, '0');

    const templateVars = {
      // Legacy — adapters already using these continue to work
      now:         windowEnd,
      lastPollAt:  windowStart,
      siteId:      adapter.siteId,
      // Explicit window bounds (ISO-8601)
      windowStart,
      windowEnd,
      // Date components from window start (UTC) — use in URL path or body
      date:        windowStart.slice(0, 10),                    // 2024-01-15
      year:        String(winStart.getUTCFullYear()),           // 2024
      month:       pad(winStart.getUTCMonth() + 1),            // 01
      day:         pad(winStart.getUTCDate()),                  // 15
      hour:        pad(winStart.getUTCHours()),                 // 00
      // Unix timestamps
      unixStart:   String(Math.floor(winStart.getTime() / 1000)),
      unixEnd:     String(Math.floor(winEnd.getTime() / 1000)),
      unixStartMs: String(winStart.getTime()),
      unixEndMs:   String(winEnd.getTime()),
    };

    // Resolve the effective time-param config.
    // run.timeParams takes priority over adapter.pullTimeParams so adapters that
    // work without date params for regular polling can still be backfilled.
    const effectiveTimeParams = this.resolveTimeParams(run, adapter);
    const injectedParams = effectiveTimeParams
      ? this.buildWindowTimeParams(effectiveTimeParams, windowStart, windowEnd)
      : {};

    if (!effectiveTimeParams) {
      this.logger.debug(
        `Backfill ${runId} chunk ${chunkIndex}: no explicit timeParams — ` +
        `relying on template variables ({{windowStart}}, {{date}}, etc.) in the adapter URL/body.`,
      );
    }

    // Build URL + query params
    let url = interpolate(adapter.pullUrl, templateVars);
    const queryParams = { ...adapter.pullQueryParams };
    if (effectiveTimeParams?.location === 'query') {
      Object.assign(queryParams, injectedParams);
    }
    if (Object.keys(queryParams).length > 0) {
      const qs = new URLSearchParams(
        Object.fromEntries(
          Object.entries(queryParams).map(([k, v]) => [k, interpolate(String(v), templateVars)]),
        ),
      );
      url += (url.includes('?') ? '&' : '?') + qs.toString();
    }

    // Build headers + auth
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
      if (effectiveTimeParams?.location === 'body') {
        bodyObj = { ...bodyObj, ...injectedParams };
      }
      body = JSON.stringify(bodyObj);
    }

    this.logger.debug(`Backfill ${runId} chunk ${chunkIndex}: ${adapter.pullMethod} ${url}`);

    const res = await fetch(url, {
      method: adapter.pullMethod,
      headers,
      body,
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      this.logger.error(
        `Backfill ${runId} chunk ${chunkIndex}: ${res.status} ${res.statusText}` +
        (errBody ? `\n${errBody.slice(0, 500)}` : ''),
      );
      await this.runs.increment({ id: runId }, 'failedChunks', 1);
      await this.markCompleteIfDone(runId, totalChunks);
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    const responseBody = await res.json();
    const mappedReadings = await mapPullResponse(
      responseBody,
      adapter.responseMapping,
      (_name: string) => undefined,
    );

    // Assign phenomenonTime based on the chosen strategy since the external API
    // may not include timestamps per reading.
    const timed = this.assignTimestamps(mappedReadings, winStart, winEnd, timestampStrategy);

    const batchId = randomUUID();
    const receivedAt = new Date().toISOString();

    const jobs: IngestJob[] = timed.map((r) => ({
      sensorId:       r.sensorId,
      phenomenonTime: r.phenomenonTime,
      data:           r.data,
      organizationId,
      siteId:         r.siteId,
      receivedAt,
      correlationId:  randomUUID(),
      batchId,
      source: 'pull' as const,
    }));

    if (jobs.length > 0) {
      await this.ingest.enqueue(jobs);
      this.logger.log(
        `Backfill ${runId} chunk ${chunkIndex}/${totalChunks}: enqueued ${jobs.length} readings ` +
        `[${windowStart} → ${windowEnd}]`,
      );
    }

    // Atomic progress increment (safe under concurrent workers).
    await this.runs.increment({ id: runId }, 'completedChunks', 1);
    if (jobs.length > 0) {
      await this.runs.increment({ id: runId }, 'totalReadings', jobs.length);
    }
    await this.markCompleteIfDone(runId, totalChunks);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async markCompleteIfDone(runId: string, totalChunks: number): Promise<void> {
    const current = await this.runs.findOne({ where: { id: runId } });
    if (!current || current.status === 'CANCELLED') return;
    const done = current.completedChunks + current.failedChunks;
    if (done >= totalChunks) {
      const finalStatus = current.failedChunks === totalChunks ? 'FAILED' : 'COMPLETED';
      await this.runs.update(runId, { status: finalStatus });
    }
  }

  /**
   * Return the time-param config to use for this chunk.
   * run.timeParams wins; falls back to adapter.pullTimeParams when enabled.
   * Returns null if neither is configured (caller logs a warning).
   */
  private resolveTimeParams(run: BackfillRun, adapter: SiteAdapter): BackfillTimeParams | null {
    if (run.timeParams) return run.timeParams;

    const atp = adapter.pullTimeParams;
    if (atp?.enabled) {
      return {
        startParamName: atp.startParamName ?? 'startTime',
        endParamName:   atp.endParamName   ?? 'endTime',
        format:         atp.format,
        customFormat:   atp.customFormat,
        location:       atp.location,
      };
    }

    return null;
  }

  /** Render the window bounds into the param key→value map expected by the API. */
  private buildWindowTimeParams(
    tp: BackfillTimeParams,
    windowStart: string,
    windowEnd: string,
  ): Record<string, string> {
    const startMs = new Date(windowStart).getTime();
    const endMs   = new Date(windowEnd).getTime();

    if (tp.mode === 'single-date') {
      // API accepts only one date param — use the window start as the "day".
      const paramName = tp.dateParamName ?? tp.startParamName;
      return { [paramName]: this.formatTime(startMs, tp.format, tp.customFormat) };
    }

    return {
      [tp.startParamName]: this.formatTime(startMs, tp.format, tp.customFormat),
      [tp.endParamName]:   this.formatTime(endMs,   tp.format, tp.customFormat),
    };
  }

  /**
   * Override phenomenonTime on every reading using the chosen strategy.
   *
   * 'from-response' is the only strategy that trusts the API-provided timestamp.
   * All other strategies ignore what the API returned and derive a time from the
   * window bounds — use this when the external system sends no timestamps.
   */
  private assignTimestamps(
    readings: MappedReading[],
    windowStart: Date,
    windowEnd: Date,
    strategy: BackfillTimestampStrategy,
  ): MappedReading[] {
    const startMs = windowStart.getTime();
    const endMs   = windowEnd.getTime();
    const midMs   = Math.floor((startMs + endMs) / 2);
    const total   = readings.length;

    return readings.map((r, i) => {
      let phenomenonTime: string;

      switch (strategy) {
        case 'from-response':
          // Trust the API timestamp; it may be 'now' if the API omits timestamps.
          phenomenonTime = r.phenomenonTime;
          break;

        case 'window-start':
          phenomenonTime = windowStart.toISOString();
          break;

        case 'window-end':
          phenomenonTime = windowEnd.toISOString();
          break;

        case 'window-mid':
          phenomenonTime = new Date(midMs).toISOString();
          break;

        case 'sequence':
        default: {
          // Distribute evenly; single reading lands at windowStart.
          const frac = total > 1 ? i / (total - 1) : 0;
          phenomenonTime = new Date(Math.round(startMs + frac * (endMs - startMs))).toISOString();
          break;
        }
      }

      return { ...r, phenomenonTime };
    });
  }

  private formatTime(timestampMs: number, format: string, customFormat?: string): string {
    const date = new Date(timestampMs);
    switch (format) {
      case 'unix_ms': return String(timestampMs);
      case 'unix_s':  return String(Math.floor(timestampMs / 1000));
      case 'custom':
        if (customFormat) {
          return customFormat
            .replace('YYYY', String(date.getUTCFullYear()))
            .replace('MM',   String(date.getUTCMonth() + 1).padStart(2, '0'))
            .replace('DD',   String(date.getUTCDate()).padStart(2, '0'))
            .replace('HH',   String(date.getUTCHours()).padStart(2, '0'))
            .replace('mm',   String(date.getUTCMinutes()).padStart(2, '0'))
            .replace('ss',   String(date.getUTCSeconds()).padStart(2, '0'));
        }
        return date.toISOString();
      default:
        return date.toISOString();
    }
  }

  private interpolateHeaders(
    headers: Record<string, string>,
    vars: Record<string, string>,
  ): Record<string, string> {
    return Object.fromEntries(
      Object.entries(headers).map(([k, v]) => [k, interpolate(v, vars)]),
    );
  }

  private applyAuth(
    headers: Record<string, string>,
    authType: string,
    config?: PullAuthConfig,
  ): void {
    if (!config) return;
    switch (authType) {
      case 'apiKey':
        if (config.headerName && config.value) headers[config.headerName] = config.value;
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
