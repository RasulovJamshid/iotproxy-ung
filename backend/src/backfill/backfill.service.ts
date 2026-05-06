import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { BackfillRun } from './backfill-run.entity';
import { SiteAdapter } from '../adapters/site-adapter.entity';
import {
  QUEUE_NAMES, BackfillChunkJob, BackfillChunkSize, BackfillTimestampStrategy, BackfillTimeParams,
} from '@iotproxy/shared';

export interface CreateBackfillRunDto {
  adapterId: string;
  startDate: string;
  endDate: string;
  chunkSize?: BackfillChunkSize;
  /** Required when chunkSize = 'custom' */
  chunkSizeSec?: number;
  timestampStrategy?: BackfillTimestampStrategy;
  /**
   * How to inject the window start/end into the API request.
   * Required when the adapter's pullTimeParams are not configured (i.e. the API
   * returns current-day data by default and needs explicit date params for history).
   */
  timeParams?: BackfillTimeParams;
  /** Milliseconds to delay between chunk jobs; throttles the external API call rate */
  delayBetweenChunksMs?: number;
}

@Injectable()
export class BackfillService {
  constructor(
    @InjectRepository(BackfillRun) private runs: Repository<BackfillRun>,
    @InjectRepository(SiteAdapter) private adapters: Repository<SiteAdapter>,
    @InjectQueue(QUEUE_NAMES.BACKFILL) private backfillQueue: Queue,
  ) {}

  async create(dto: CreateBackfillRunDto, organizationId: string): Promise<BackfillRun> {
    const adapter = await this.adapters.findOne({ where: { id: dto.adapterId, organizationId } });
    if (!adapter) throw new NotFoundException(`Adapter ${dto.adapterId} not found`);
    if (!adapter.pullUrl || !adapter.responseMapping) {
      throw new BadRequestException('Adapter has no pull URL or response mapping configured');
    }

    const start = new Date(dto.startDate);
    const end   = new Date(dto.endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('startDate and endDate must be valid ISO-8601 timestamps');
    }
    if (start >= end) {
      throw new BadRequestException('startDate must be before endDate');
    }

    const chunkSize = dto.chunkSize ?? 'day';
    if (chunkSize === 'custom' && !dto.chunkSizeSec) {
      throw new BadRequestException('chunkSizeSec is required when chunkSize is "custom"');
    }

    const windows = generateWindows(start, end, chunkSize, dto.chunkSizeSec);
    const totalChunks = windows.length;

    // Date injection is optional here: the adapter URL/body can use template
    // variables ({{windowStart}}, {{date}}, {{year}}, {{month}}, etc.) which are
    // interpolated by the worker regardless of timeParams. timeParams is kept for
    // backwards compatibility and for adapters that need explicit query/body params.

    const run = await this.runs.save(
      this.runs.create({
        adapterId:            dto.adapterId,
        organizationId,
        rangeStart:           start,
        rangeEnd:             end,
        chunkSize,
        chunkSizeSec:         dto.chunkSizeSec,
        timestampStrategy:    dto.timestampStrategy ?? 'sequence',
        timeParams:           dto.timeParams,
        status:               'RUNNING',
        totalChunks,
        completedChunks:      0,
        failedChunks:         0,
        totalReadings:        0,
        delayBetweenChunksMs: dto.delayBetweenChunksMs ?? 0,
      }),
    );

    const delayMs = run.delayBetweenChunksMs;
    await this.backfillQueue.addBulk(
      windows.map((w, i) => ({
        name: 'backfill-chunk',
        data: {
          runId:             run.id,
          adapterId:         adapter.id,
          organizationId,
          windowStart:       w.windowStart.toISOString(),
          windowEnd:         w.windowEnd.toISOString(),
          chunkIndex:        i,
          totalChunks,
          timestampStrategy: run.timestampStrategy,
        } as BackfillChunkJob,
        opts: {
          attempts:         3,
          backoff:          { type: 'exponential', delay: 5_000 },
          removeOnComplete: { count: 10 },
          removeOnFail:     { count: 200 },
          delay:            i * delayMs,
        },
      })),
    );

    return run;
  }

  findAll(organizationId: string, adapterId?: string): Promise<BackfillRun[]> {
    const where: Record<string, unknown> = { organizationId };
    if (adapterId) where.adapterId = adapterId;
    return this.runs.find({ where, order: { createdAt: 'DESC' } });
  }

  async findOne(runId: string, organizationId: string): Promise<BackfillRun> {
    const run = await this.runs.findOne({ where: { id: runId, organizationId } });
    if (!run) throw new NotFoundException(`Backfill run ${runId} not found`);
    return run;
  }

  async cancel(runId: string, organizationId: string): Promise<{ cancelled: boolean }> {
    const run = await this.findOne(runId, organizationId);
    if (run.status === 'COMPLETED' || run.status === 'CANCELLED') {
      throw new BadRequestException(`Run is already ${run.status}`);
    }
    // In-flight and queued jobs will check this flag at start and skip gracefully.
    await this.runs.update(run.id, { status: 'CANCELLED' });
    return { cancelled: true };
  }
}

// ── Window generation ─────────────────────────────────────────────────────────

function chunkSizeToMs(chunkSize: BackfillChunkSize, customSec?: number): number {
  switch (chunkSize) {
    case 'hour':   return 60 * 60 * 1_000;
    case 'day':    return 24 * 60 * 60 * 1_000;
    case 'week':   return 7 * 24 * 60 * 60 * 1_000;
    case 'month':  return 30 * 24 * 60 * 60 * 1_000;
    case 'custom': return (customSec ?? 3_600) * 1_000;
  }
}

function generateWindows(
  start: Date,
  end: Date,
  chunkSize: BackfillChunkSize,
  customSec?: number,
): { windowStart: Date; windowEnd: Date }[] {
  const windows: { windowStart: Date; windowEnd: Date }[] = [];
  const chunkMs = chunkSizeToMs(chunkSize, customSec);
  let cursor = start.getTime();
  const endMs = end.getTime();

  while (cursor < endMs) {
    const windowEnd = Math.min(cursor + chunkMs, endMs);
    windows.push({ windowStart: new Date(cursor), windowEnd: new Date(windowEnd) });
    cursor = windowEnd;
  }

  return windows;
}
