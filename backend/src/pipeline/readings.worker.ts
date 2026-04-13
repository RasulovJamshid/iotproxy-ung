import { Injectable, Logger, OnModuleDestroy, Inject } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent, InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Job, Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { PipelineService } from './pipeline.service';
import { TimescaleRepository } from '../database/timescale.repository';
import { ReadingsGateway } from '../query/readings.gateway';
import { DiscoveryService } from '../discovery/discovery.service';
import { Sensor } from '../sensors/sensor.entity';
import { IngestJob, ProcessedReading, QUEUE_NAMES } from '@iotproxy/shared';

const BATCH_SIZE = 100;
const FLUSH_INTERVAL_MS = 500;
const LAST_READING_CACHE_TTL = 90;  // seconds — Redis TTL for lastReadingAt per sensor

@Processor(QUEUE_NAMES.READINGS, { concurrency: 5 })
@Injectable()
export class ReadingsWorker extends WorkerHost implements OnModuleDestroy {
  private readonly logger = new Logger(ReadingsWorker.name);
  private buffer: ProcessedReading[] = [];
  private flushTimer?: NodeJS.Timeout;

  constructor(
    private pipeline: PipelineService,
    private timescale: TimescaleRepository,
    private gateway: ReadingsGateway,
    private discovery: DiscoveryService,
    @InjectRepository(Sensor) private sensors: Repository<Sensor>,
    @Inject('CACHE_REDIS') private redis: Redis,
    @InjectQueue(QUEUE_NAMES.READINGS) private readingsQueue: Queue,
  ) {
    super();
    this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
  }

  async onModuleDestroy() {
    clearInterval(this.flushTimer);
    if (this.buffer.length > 0) {
      this.logger.log(`Graceful shutdown: draining ${this.buffer.length} buffered readings`);
      await this.flush();
    }
  }

  async process(job: Job<IngestJob & { _isDerived?: boolean }>): Promise<void> {
    // Feed discovery tracking before pipeline (so DISCOVERY-status sites capture raw payloads)
    await this.discovery.recordDiscoveryReading(job.data).catch((err) =>
      this.logger.warn(`Discovery record failed for site ${job.data.siteId}: ${err.message}`),
    );

    const processed = await this.pipeline.process({ ...job.data, _isDerived: job.data['_isDerived'] } as any);
    if (!processed) return;

    // Track lastReadingAt in Redis (cheap write) — flushed to DB every 60s
    await this.trackLastReading(processed.sensorId, processed.phenomenonTime);

    this.buffer.push(processed);

    if (this.buffer.length >= BATCH_SIZE) {
      await this.flush();
    }

    // Re-enqueue derived readings tagged so DerivedStage skips them
    if (processed.derivedReadings?.length) {
      for (const derived of processed.derivedReadings) {
        await this.readingsQueue.add('process-reading', {
          sensorId: derived.sensorId,
          phenomenonTime: derived.phenomenonTime,
          data: derived.processedData,
          organizationId: derived.organizationId,
          siteId: derived.siteId,
          receivedAt: derived.receivedAt,
          correlationId: derived.correlationId,
          batchId: job.data.batchId,
          source: 'http' as const,
          _isDerived: true,
        } as IngestJob & { _isDerived: boolean });
      }
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(`Job ${job.id} failed: ${err.message}`, {
      correlationId: job.data?.correlationId,
      sensorId: job.data?.sensorId,
    });
  }

  // ── lastReadingAt tracking ─────────────────────────────────────────────────
  // Redis stores a dirty set. A separate cron flushes dirty sensors to Postgres
  // so the hot path never waits on a DB write.

  private async trackLastReading(sensorId: string, phenomenonTime: string): Promise<void> {
    const key = `sensor:lastReading:${sensorId}`;
    await this.redis.setex(key, LAST_READING_CACHE_TTL * 2, phenomenonTime);
    // Mark as dirty for the flush cron
    await this.redis.sadd('sensor:lastReading:dirty', sensorId);
  }

  // ── Batch flush ────────────────────────────────────────────────────────────

  private async flush() {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0, this.buffer.length);

    try {
      await this.timescale.batchInsert(batch);

      // Enforce per-sensor record limits
      const sensorIds = [...new Set(batch.map((r) => r.sensorId))];
      const limitedSensors = await this.sensors.find({
        where: { id: In(sensorIds) },
        select: ['id', 'maxRecordsPerSensor'],
      });
      await Promise.all(
        limitedSensors
          .filter((s) => s.maxRecordsPerSensor != null)
          .map((s) => this.timescale.enforceRecordLimit(s.id, s.maxRecordsPerSensor!)),
      );

      for (const reading of batch) {
        this.gateway.emit(reading.siteId, {
          type: 'reading',
          siteId: reading.siteId,
          sensorId: reading.sensorId,
          phenomenonTime: reading.phenomenonTime,
          processedData: reading.processedData,
          qualityCode: reading.qualityCode,
        });
      }
    } catch (err) {
      this.logger.error(`Batch insert failed for ${batch.length} readings`, err);
      this.buffer.unshift(...batch);
      throw err;
    }
  }
}
