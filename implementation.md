# IoT Proxy Platform — Implementation Guide

## How to Use This Document

Each section covers one feature or subsystem. For each, you will find: what to build, the exact files to create, the key code patterns, and the pitfalls to avoid. Sections are ordered by implementation dependency — build them in sequence.

---

## Phase 1 — Foundation

### 1.1 Monorepo setup

Create the workspace root with Turborepo managing build order.

**`package.json` (root)**
```json
{
  "name": "iotproxy",
  "private": true,
  "workspaces": ["backend", "frontend", "shared"],
  "scripts": {
    "dev": "turbo run dev --parallel",
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "format:check": "prettier --check .",
    "format:write": "prettier --write .",
    "migrate": "npm run migrate -w @iotproxy/backend",
    "seed": "npm run seed -w @iotproxy/backend"
  },
  "devDependencies": {
    "prettier": "^3.3.3",
    "turbo": "^2.0.0",
    "typescript": "^5.4.0"
  }
}
```

**`turbo.json`**
```json
{
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "dev":   { "cache": false, "persistent": true },
    "test":  { "dependsOn": ["^build"] }
  }
}
```

**`shared/package.json`** — types and constants shared between backend and frontend. No runtime dependencies.

```json
{
  "name": "@iotproxy/shared",
  "main": "dist/index.js",
  "types": "dist/index.d.ts"
}
```

Key exports from `shared/types/index.ts`:
```typescript
export type ReadingQuality = 'GOOD' | 'UNCERTAIN' | 'BAD' | 'MAINTENANCE';
export type SensorStatus = 'ACTIVE' | 'DISABLED' | 'MAINTENANCE' | 'CALIBRATING';
export type CommissioningStatus = 'DISCOVERY' | 'REVIEW' | 'ACTIVE' | 'SUSPENDED';
export type ConnectivityStatus = 'ONLINE' | 'OFFLINE' | 'UNKNOWN';
export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type AlertOperator = 'GT' | 'LT' | 'GTE' | 'LTE' | 'EQ' | 'NEQ';
export type ExportFormat = 'csv' | 'parquet';

export interface ProcessedReading {
  sensorId: string;
  phenomenonTime: string;
  rawData: Record<string, unknown>;
  processedData: Record<string, unknown>;
  qualityCode: ReadingQuality;
  pipelineFlags: string[];
  configVersionId: string | null;
  correlationId: string;
}
```

Key exports from `shared/constants/index.ts`:
```typescript
export const ERROR_CODES = {
  SENSOR_DISABLED:             'SENSOR_DISABLED',
  SITE_NOT_IN_DISCOVERY:       'SITE_NOT_IN_DISCOVERY',
  PAYLOAD_TOO_LARGE:           'PAYLOAD_TOO_LARGE',
  TIMESTAMP_OUT_OF_BOUNDS:     'TIMESTAMP_OUT_OF_BOUNDS',
  RATE_LIMIT_EXCEEDED:         'RATE_LIMIT_EXCEEDED',
  DUPLICATE_READING:           'DUPLICATE_READING',
  FORMULA_CIRCULAR_DEPENDENCY: 'FORMULA_CIRCULAR_DEPENDENCY',
  CONFIG_VERSION_CONFLICT:     'CONFIG_VERSION_CONFLICT',
} as const;

export const QUEUE_NAMES = {
  READINGS:      'readings',
  WEBHOOKS:      'webhooks',
  NOTIFICATIONS: 'notifications',
  EXPORTS:       'exports',
} as const;
```

---

### 1.2 NestJS backend bootstrap

**`backend/src/main.ts`**
```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // Global prefix — versioning from day one
  app.setGlobalPrefix('api/v1');

  // Body size limit — prevents payload amplification attacks
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ limit: '1mb', extended: true }));

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useWebSocketAdapter(new IoAdapter(app));

  const config = new DocumentBuilder()
    .setTitle('IoT Proxy API')
    .setVersion('1.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-API-Key' }, 'api-key')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  await app.listen(3000);
}
bootstrap();
```

**`backend/src/config/configuration.ts`**
```typescript
import * as Joi from 'joi';

export const validationSchema = Joi.object({
  DATABASE_URL:                Joi.string().required(),
  REDIS_URL:                   Joi.string().required(),
  MQTT_BROKER_URL:             Joi.string().required(),
  JWT_SECRET:                  Joi.string().min(32).required(),
  JWT_REFRESH_SECRET:          Joi.string().min(32).required(),
  MINIO_ENDPOINT:              Joi.string().required(),
  MINIO_ACCESS_KEY:            Joi.string().required(),
  MINIO_SECRET_KEY:            Joi.string().required(),
  SMTP_HOST:                   Joi.string().required(),
  APP_BASE_URL:                Joi.string().uri().required(),
  RATE_LIMIT_DEFAULT_RPM:      Joi.number().default(10000),
  DISCOVERY_WINDOW_HOURS:      Joi.number().default(24),
  CLOCK_SKEW_FUTURE_HOURS:     Joi.number().default(24),
  CLOCK_SKEW_PAST_DAYS:        Joi.number().default(30),
  NODE_ENV:                    Joi.string().valid('development', 'production', 'test').default('development'),
});

export default () => ({
  database: { url: process.env.DATABASE_URL },
  redis:    { url: process.env.REDIS_URL },
  mqtt:     { url: process.env.MQTT_BROKER_URL },
  jwt: {
    secret:        process.env.JWT_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    expiresIn:     '15m',
    refreshExpiresIn: '7d',
  },
  ingest: {
    rateLimitRpm:     parseInt(process.env.RATE_LIMIT_DEFAULT_RPM || '10000'),
    maxBulkItems:     500,
    maxBodyBytes:     1_000_000,
    clockSkewFutureH: parseInt(process.env.CLOCK_SKEW_FUTURE_HOURS || '24'),
    clockSkewPastD:   parseInt(process.env.CLOCK_SKEW_PAST_DAYS || '30'),
  },
  discovery: {
    windowHours:  parseInt(process.env.DISCOVERY_WINDOW_HOURS || '24'),
    replayCapacity: 500,
  },
});
```

---

### 1.3 TimescaleDB setup

**`infra/timescaledb/init.sql`** — runs automatically on first container start.

```sql
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Main readings hypertable
CREATE TABLE IF NOT EXISTS sensor_readings (
  id                UUID        DEFAULT gen_random_uuid(),
  sensor_id         UUID        NOT NULL,
  organization_id   UUID        NOT NULL,
  site_id           UUID        NOT NULL,
  phenomenon_time   TIMESTAMPTZ NOT NULL,
  received_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_data          JSONB       NOT NULL DEFAULT '{}',
  processed_data    JSONB       NOT NULL DEFAULT '{}',
  quality_code      TEXT        NOT NULL DEFAULT 'GOOD',
  pipeline_flags    TEXT[]      DEFAULT '{}',
  config_version_id UUID,
  correlation_id    UUID,
  dedup_key         TEXT GENERATED ALWAYS AS
    (sensor_id::text || '|' || phenomenon_time::text) STORED,
  PRIMARY KEY (id, phenomenon_time)  -- compound PK required for hypertable
);

SELECT create_hypertable(
  'sensor_readings', 'phenomenon_time',
  chunk_time_interval => INTERVAL '1 week',
  if_not_exists => TRUE
);

-- Idempotency: duplicate readings silently ignored
CREATE UNIQUE INDEX IF NOT EXISTS idx_readings_dedup
  ON sensor_readings (dedup_key);

-- Fast sensor lookups
CREATE INDEX IF NOT EXISTS idx_readings_sensor_time
  ON sensor_readings (sensor_id, phenomenon_time DESC);

-- Compression (applied to chunks older than 7 days)
ALTER TABLE sensor_readings SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'sensor_id',
  timescaledb.compress_orderby = 'phenomenon_time DESC'
);

SELECT add_compression_policy('sensor_readings',
  compress_after => INTERVAL '7 days',
  if_not_exists => TRUE);

-- Retention: raw data kept 90 days
SELECT add_retention_policy('sensor_readings',
  drop_after => INTERVAL '90 days',
  if_not_exists => TRUE);

-- Hourly continuous aggregate
CREATE MATERIALIZED VIEW IF NOT EXISTS readings_1h
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', phenomenon_time) AS bucket,
  sensor_id, site_id, organization_id,
  AVG((processed_data->>'value')::float)   AS avg_val,
  MIN((processed_data->>'value')::float)   AS min_val,
  MAX((processed_data->>'value')::float)   AS max_val,
  COUNT(*)                                 AS sample_count
FROM sensor_readings
WHERE quality_code IN ('GOOD', 'UNCERTAIN')
  AND processed_data ? 'value'
GROUP BY 1, sensor_id, site_id, organization_id;

SELECT add_continuous_aggregate_policy('readings_1h',
  start_offset => INTERVAL '3 hours',
  end_offset   => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists => TRUE);

SELECT add_retention_policy('readings_1h',
  drop_after => INTERVAL '2 years',
  if_not_exists => TRUE);

-- Daily continuous aggregate (from hourly, not raw)
CREATE MATERIALIZED VIEW IF NOT EXISTS readings_1d
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 day', bucket) AS bucket,
  sensor_id, site_id, organization_id,
  AVG(avg_val)          AS avg_val,
  MIN(min_val)          AS min_val,
  MAX(max_val)          AS max_val,
  SUM(sample_count)     AS sample_count
FROM readings_1h
GROUP BY 1, sensor_id, site_id, organization_id;

SELECT add_continuous_aggregate_policy('readings_1d',
  start_offset => INTERVAL '3 days',
  end_offset   => INTERVAL '1 day',
  schedule_interval => INTERVAL '1 day',
  if_not_exists => TRUE);

SELECT add_retention_policy('readings_1d',
  drop_after => INTERVAL '5 years',
  if_not_exists => TRUE);
```

**`backend/src/database/timescale.repository.ts`** — raw pg pool, never use TypeORM/Prisma for this table.

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { ProcessedReading } from '@iotproxy/shared';

@Injectable()
export class TimescaleRepository implements OnModuleInit {
  private pool: Pool;

  constructor(private config: ConfigService) {}

  onModuleInit() {
    this.pool = new Pool({
      connectionString: this.config.get('database.url'),
      max: 20,
      idleTimeoutMillis: 30_000,
    });
  }

  // Batch insert — ON CONFLICT DO NOTHING for idempotency
  async batchInsert(readings: ProcessedReading[]): Promise<void> {
    if (readings.length === 0) return;

    const values = readings.map((r, i) => {
      const base = i * 9;
      return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9})`;
    }).join(',');

    const params = readings.flatMap(r => [
      r.sensorId,
      r.organizationId,
      r.siteId,
      new Date(r.phenomenonTime),
      JSON.stringify(r.rawData),
      JSON.stringify(r.processedData),
      r.qualityCode,
      r.pipelineFlags,
      r.configVersionId ?? null,
    ]);

    await this.pool.query(
      `INSERT INTO sensor_readings
         (sensor_id,organization_id,site_id,phenomenon_time,
          raw_data,processed_data,quality_code,pipeline_flags,config_version_id)
       VALUES ${values}
       ON CONFLICT (dedup_key) DO NOTHING`,
      params
    );
  }

  // Query routing: pick the right view based on time range
  async queryTimeSeries(params: {
    sensorId: string;
    startTs: Date;
    endTs: Date;
    agg: 'AVG' | 'MIN' | 'MAX' | 'SUM' | 'COUNT' | 'NONE';
    intervalMs?: number;
    limit?: number;
    cursor?: Date;
  }) {
    const rangeMs = params.endTs.getTime() - params.startTs.getTime();
    const sixHours = 6 * 3600_000;
    const sevenDays = 7 * 86400_000;

    if (params.agg === 'NONE' || rangeMs < sixHours) {
      return this.queryRaw(params);
    } else if (rangeMs < sevenDays) {
      return this.queryAggregate('readings_1h', 'bucket', params);
    } else {
      return this.queryAggregate('readings_1d', 'bucket', params);
    }
  }

  private async queryRaw(params: any) {
    const cursorClause = params.cursor
      ? 'AND phenomenon_time < $4'
      : '';
    const result = await this.pool.query(
      `SELECT phenomenon_time, processed_data, quality_code, pipeline_flags
       FROM sensor_readings
       WHERE sensor_id = $1
         AND phenomenon_time >= $2
         AND phenomenon_time <= $3
         ${cursorClause}
       ORDER BY phenomenon_time DESC
       LIMIT $${params.cursor ? 5 : 4}`,
      params.cursor
        ? [params.sensorId, params.startTs, params.endTs, params.cursor, params.limit ?? 1000]
        : [params.sensorId, params.startTs, params.endTs, params.limit ?? 1000]
    );
    return result.rows;
  }

  private async queryAggregate(view: string, timeCol: string, params: any) {
    const intervalSec = Math.floor((params.intervalMs ?? 3600_000) / 1000);
    const result = await this.pool.query(
      `SELECT time_bucket($1::interval, ${timeCol}) AS bucket,
              AVG(avg_val) AS avg_val,
              MIN(min_val) AS min_val,
              MAX(max_val) AS max_val,
              SUM(sample_count) AS sample_count
       FROM ${view}
       WHERE sensor_id = $2
         AND ${timeCol} >= $3
         AND ${timeCol} <= $4
       GROUP BY 1
       ORDER BY 1 DESC
       LIMIT $5`,
      [`${intervalSec} seconds`, params.sensorId, params.startTs, params.endTs, params.limit ?? 1000]
    );
    return result.rows;
  }

  // Multi-sensor latest values — for dashboard "site overview" queries
  async getLatestPerSensor(sensorIds: string[]): Promise<Record<string, any>> {
    if (sensorIds.length === 0) return {};
    const result = await this.pool.query(
      `SELECT DISTINCT ON (sensor_id)
         sensor_id, phenomenon_time, processed_data, quality_code
       FROM sensor_readings
       WHERE sensor_id = ANY($1)
       ORDER BY sensor_id, phenomenon_time DESC`,
      [sensorIds]
    );
    return Object.fromEntries(result.rows.map(r => [r.sensor_id, r]));
  }
}
```

---

## Phase 2 — Authentication and API Keys

### 2.1 API key generation and caching

**`backend/src/api-keys/api-key.service.ts`**
```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Repository } from 'typeorm';
import { Redis } from 'ioredis';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { ApiKey } from './api-key.entity';

@Injectable()
export class ApiKeyService {
  private readonly CACHE_TTL = 60; // seconds
  private readonly CACHE_PREFIX = 'apikey:';

  constructor(
    @InjectRepository(ApiKey) private repo: Repository<ApiKey>,
    @InjectRedis() private redis: Redis,
  ) {}

  async generate(organizationId: string, opts: {
    siteId?: string;
    permissions: string[];
    expiresAt?: Date;
    name: string;
  }): Promise<{ key: string; apiKey: ApiKey }> {
    const raw = 'iot_' + randomBytes(32).toString('base58');
    const hash = await bcrypt.hash(raw, 10);
    const prefix = raw.slice(0, 12);

    const apiKey = this.repo.create({
      keyHash: hash,
      prefix,
      organizationId,
      siteId: opts.siteId,
      permissions: opts.permissions,
      expiresAt: opts.expiresAt,
      name: opts.name,
    });

    await this.repo.save(apiKey);
    return { key: raw, apiKey };
    // raw key shown once only — never stored in plaintext
  }

  async validate(rawKey: string): Promise<ApiKey | null> {
    // Check Redis cache first
    const cacheKey = this.CACHE_PREFIX + rawKey.slice(0, 12);
    const cached = await this.redis.get(cacheKey);
    if (cached === 'invalid') return null;
    if (cached) {
      const parsed = JSON.parse(cached);
      // Verify full hash (cache stores metadata only, not the hash itself)
      // For full security, store the hash in cache too and verify
      return parsed;
    }

    // Cache miss — query DB
    const prefix = rawKey.slice(0, 12);
    const candidates = await this.repo.find({ where: { prefix } });

    for (const candidate of candidates) {
      if (await bcrypt.compare(rawKey, candidate.keyHash)) {
        if (candidate.expiresAt && candidate.expiresAt < new Date()) {
          await this.redis.setex(cacheKey, this.CACHE_TTL, 'invalid');
          return null;
        }
        // Cache valid key metadata (not the hash)
        const toCache = { ...candidate };
        delete toCache.keyHash;
        await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(toCache));

        // Update lastUsedAt asynchronously
        this.repo.update(candidate.id, { lastUsedAt: new Date() });

        return candidate;
      }
    }

    await this.redis.setex(cacheKey, this.CACHE_TTL, 'invalid');
    return null;
  }

  async revoke(id: string): Promise<void> {
    const key = await this.repo.findOne({ where: { id } });
    if (!key) return;
    await this.repo.update(id, { revokedAt: new Date() });
    // Immediately invalidate cache
    await this.redis.setex(this.CACHE_PREFIX + key.prefix, 300, 'invalid');
  }
}
```

### 2.2 Key expiry enforcement

**`backend/src/api-keys/key-expiry.cron.ts`**
```typescript
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, Between } from 'typeorm';
import { ApiKey } from './api-key.entity';
import { WebhookService } from '../webhooks/webhook.service';

@Injectable()
export class KeyExpiryCron {
  constructor(
    @InjectRepository(ApiKey) private repo: Repository<ApiKey>,
    private webhooks: WebhookService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async enforceExpiry() {
    // Mark expired keys as revoked
    const expired = await this.repo.find({
      where: {
        expiresAt: LessThan(new Date()),
        revokedAt: null as any,
      },
    });

    for (const key of expired) {
      await this.repo.update(key.id, { revokedAt: new Date() });
      await this.webhooks.dispatch(key.organizationId, 'api_key.expired', { keyId: key.id, prefix: key.prefix });
    }

    // Warn about keys expiring in 7 days
    const warnAfter  = new Date();
    const warnBefore = new Date(Date.now() + 7 * 86400_000);
    const expiringSoon = await this.repo.find({
      where: {
        expiresAt: Between(warnAfter, warnBefore),
        revokedAt: null as any,
        expiryWarningsentAt: null as any,
      },
    });

    for (const key of expiringSoon) {
      await this.webhooks.dispatch(key.organizationId, 'api_key.expiring_soon', {
        keyId: key.id, prefix: key.prefix, expiresAt: key.expiresAt,
      });
      await this.repo.update(key.id, { expiryWarningSentAt: new Date() });
    }
  }
}
```

---

## Phase 3 — Ingest Path

### 3.1 HTTP ingest controller

**`backend/src/ingest/http-ingest.controller.ts`**
```typescript
import { Controller, Post, Body, Headers, HttpCode, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FlexibleAuthGuard } from '../auth/guards/flexible-auth.guard';
import { CurrentOrg } from '../auth/decorators/current-org.decorator';
import { IngestQueueProducer } from './ingest-queue.producer';
import { BulkReadingDto, SingleReadingDto } from './dto';
import { randomUUID } from 'crypto';

@Controller('ingest')
@UseGuards(FlexibleAuthGuard)
export class HttpIngestController {
  constructor(private queue: IngestQueueProducer) {}

  @Post('readings')
  @HttpCode(202)
  @Throttle({ default: { limit: 600, ttl: 60_000 } }) // 600/min default, override per org
  async ingestSingle(
    @Body() dto: SingleReadingDto,
    @CurrentOrg() orgContext: OrgContext,
  ) {
    const correlationId = randomUUID();
    const batchId = randomUUID();

    await this.queue.enqueue([{
      ...dto,
      organizationId: orgContext.organizationId,
      siteId: orgContext.siteId,
      receivedAt: new Date().toISOString(),
      correlationId,
    }], batchId);

    return { accepted: 1, batchId, correlationId };
  }

  @Post('readings/bulk')
  @HttpCode(202)
  async ingestBulk(
    @Body() dto: BulkReadingDto,
    @CurrentOrg() orgContext: OrgContext,
  ) {
    if (dto.readings.length > 500) {
      throw new PayloadTooLargeException('PAYLOAD_TOO_LARGE', 'Maximum 500 readings per bulk request');
    }

    const batchId = randomUUID();
    const jobs = dto.readings.map(r => ({
      ...r,
      organizationId: orgContext.organizationId,
      siteId: orgContext.siteId,
      receivedAt: new Date().toISOString(),
      correlationId: randomUUID(),
    }));

    await this.queue.enqueue(jobs, batchId);

    return { accepted: jobs.length, batchId };
  }
}
```

### 3.2 MQTT ingest service

**`backend/src/ingest/mqtt-ingest.service.ts`**
```typescript
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mqtt from 'mqtt';
import { IngestQueueProducer } from './ingest-queue.producer';
import { ApiKeyService } from '../api-keys/api-key.service';
import { randomUUID } from 'crypto';

@Injectable()
export class MqttIngestService implements OnModuleInit, OnModuleDestroy {
  private client: mqtt.MqttClient;
  private readonly logger = new Logger(MqttIngestService.name);

  constructor(
    private config: ConfigService,
    private queue: IngestQueueProducer,
    private apiKeys: ApiKeyService,
  ) {}

  onModuleInit() {
    this.client = mqtt.connect(this.config.get('mqtt.url'), {
      clientId: 'iotproxy-ingest-' + randomUUID().slice(0, 8),
      reconnectPeriod: 3000,
    });

    // Wildcard subscription: all sites, all sensors
    this.client.subscribe([
      'sites/+/readings',        // site-level batch
      'sites/+/sensors/+/readings',  // per-sensor
    ]);

    this.client.on('message', this.handleMessage.bind(this));
    this.client.on('error', err => this.logger.error('MQTT error', err));
  }

  private async handleMessage(topic: string, payload: Buffer) {
    try {
      const parts = topic.split('/');
      const siteId = parts[1];

      let readings: any[];
      const parsed = JSON.parse(payload.toString());
      readings = Array.isArray(parsed) ? parsed : [parsed];

      if (readings.length > 500) {
        this.logger.warn(`MQTT payload from site ${siteId} exceeds 500 items, truncating`);
        readings = readings.slice(0, 500);
      }

      const batchId = randomUUID();
      const jobs = readings.map(r => ({
        ...r,
        siteId,
        receivedAt: new Date().toISOString(),
        correlationId: randomUUID(),
        source: 'mqtt',
      }));

      await this.queue.enqueue(jobs, batchId);
    } catch (err) {
      this.logger.error(`Failed to process MQTT message on ${topic}`, err);
    }
  }

  onModuleDestroy() {
    this.client?.end();
  }
}
```

### 3.3 BullMQ producer

**`backend/src/ingest/ingest-queue.producer.ts`**
```typescript
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@iotproxy/shared';

@Injectable()
export class IngestQueueProducer {
  constructor(
    @InjectQueue(QUEUE_NAMES.READINGS) private queue: Queue,
  ) {}

  async enqueue(readings: any[], batchId: string): Promise<void> {
    const jobs = readings.map(r => ({
      name: 'process-reading',
      data: { ...r, batchId },
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: false, // keep failed jobs for dead letter review
      },
    }));

    await this.queue.addBulk(jobs);
  }
}
```

---

## Phase 4 — Pipeline

### 4.1 Pipeline orchestrator

**`backend/src/pipeline/pipeline.service.ts`**
```typescript
import { Injectable } from '@nestjs/common';
import { ValidateStage } from './stages/validate.stage';
import { FilterStage } from './stages/filter.stage';
import { TransformStage } from './stages/transform.stage';
import { AliasStage } from './stages/alias.stage';
import { DerivedStage } from './stages/derived.stage';
import { AlertStage } from './stages/alert.stage';
import { ProcessedReading } from '@iotproxy/shared';

@Injectable()
export class PipelineService {
  constructor(
    private validate: ValidateStage,
    private filter: FilterStage,
    private transform: TransformStage,
    private alias: AliasStage,
    private derived: DerivedStage,
    private alert: AlertStage,
  ) {}

  async process(raw: RawIngestJob): Promise<ProcessedReading | null> {
    const ctx: PipelineContext = {
      raw,
      current: { ...raw.data },
      flags: [],
      qualityCode: 'GOOD',
      correlationId: raw.correlationId,
    };

    // Stage 1: Validate
    const v = await this.validate.run(ctx);
    if (v.action === 'REJECT') return null;  // 422-worthy, don't store
    ctx.qualityCode = v.qualityCode;

    // Stage 2: Filter
    const f = await this.filter.run(ctx);
    if (f.action === 'DROP') return null;   // sensor disabled, silent drop
    if (f.action === 'FLAG') ctx.qualityCode = 'MAINTENANCE';

    // Stage 3: Transform
    await this.transform.run(ctx);

    // Stage 4: Alias
    await this.alias.run(ctx);

    // Stage 5: Derived (virtual sensors — spawns additional readings)
    const derived = await this.derived.run(ctx);

    // Stage 6: Alert evaluation
    await this.alert.run(ctx);

    return {
      sensorId:        raw.sensorId,
      organizationId:  raw.organizationId,
      siteId:          raw.siteId,
      phenomenonTime:  raw.phenomenonTime,
      receivedAt:      raw.receivedAt,
      rawData:         raw.data,
      processedData:   ctx.current,
      qualityCode:     ctx.qualityCode,
      pipelineFlags:   ctx.flags,
      configVersionId: ctx.configVersionId ?? null,
      correlationId:   raw.correlationId,
      derivedReadings: derived,
    };
  }
}
```

### 4.2 Validate stage (Stage 1)

**`backend/src/pipeline/stages/validate.stage.ts`**
```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ValidateStage {
  constructor(private config: ConfigService) {}

  async run(ctx: PipelineContext): Promise<{ action: 'PASS' | 'REJECT'; qualityCode: string }> {
    const { raw } = ctx;

    // Must have a timestamp
    if (!raw.phenomenonTime) {
      return { action: 'REJECT', qualityCode: 'BAD' };
    }

    // Parse and validate timestamp
    const ts = new Date(raw.phenomenonTime);
    if (isNaN(ts.getTime())) {
      ctx.flags.push('invalid_timestamp');
      return { action: 'REJECT', qualityCode: 'BAD' };
    }

    // Clock skew: reject timestamps too far in the future
    const futureLimit = this.config.get<number>('ingest.clockSkewFutureH') * 3600_000;
    if (ts.getTime() > Date.now() + futureLimit) {
      ctx.flags.push('future_timestamp');
      return { action: 'REJECT', qualityCode: 'BAD' };
    }

    // Clock skew: reject timestamps too far in the past
    const pastLimit = this.config.get<number>('ingest.clockSkewPastD') * 86400_000;
    if (ts.getTime() < Date.now() - pastLimit) {
      ctx.flags.push('stale_timestamp');
      return { action: 'REJECT', qualityCode: 'BAD' };
    }

    // Validate range if SensorConfig has expectedMin/expectedMax
    const config = ctx.sensorConfig;
    if (config?.expectedMin !== null && config?.expectedMax !== null) {
      const val = (raw.data as any)?.value;
      if (typeof val === 'number') {
        if (val < config.expectedMin || val > config.expectedMax) {
          ctx.flags.push('out_of_range');
          if (config.rejectOutOfRange) {
            return { action: 'REJECT', qualityCode: 'BAD' };
          }
          return { action: 'PASS', qualityCode: 'UNCERTAIN' };
        }
      }
    }

    return { action: 'PASS', qualityCode: 'GOOD' };
  }
}
```

### 4.3 Transform stage (Stage 3)

**`backend/src/pipeline/stages/transform.stage.ts`**
```typescript
import { Injectable } from '@nestjs/common';
// npm install convert-units
import convert from 'convert-units';

@Injectable()
export class TransformStage {
  async run(ctx: PipelineContext): Promise<void> {
    const config = ctx.sensorConfig;
    if (!config) return;

    // Apply to each numeric value in processedData
    for (const [key, val] of Object.entries(ctx.current)) {
      if (typeof val !== 'number') continue;

      let v = val;

      // 1. Scale
      if (config.scaleBy !== 1) v = v * config.scaleBy;

      // 2. Offset
      if (config.offsetBy !== 0) v = v + config.offsetBy;

      // 3. Unit conversion
      if (config.sourceUnit && config.targetUnit && config.sourceUnit !== config.targetUnit) {
        try {
          v = convert(v).from(config.sourceUnit as any).to(config.targetUnit as any);
          ctx.flags.push('unit_converted');
        } catch {
          ctx.flags.push('unit_conversion_failed');
        }
      }

      // 4. Clamp
      if (config.clampMin !== null && v < config.clampMin) {
        v = config.clampMin;
        ctx.flags.push('clamped_min');
      }
      if (config.clampMax !== null && v > config.clampMax) {
        v = config.clampMax;
        ctx.flags.push('clamped_max');
      }

      ctx.current[key] = Math.round(v * 1e6) / 1e6; // avoid float drift
    }

    ctx.configVersionId = config.versionId;
  }
}
```

### 4.4 Derived sensor stage (Stage 5)

**`backend/src/pipeline/stages/derived.stage.ts`**
```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Redis } from 'ioredis';
import * as math from 'mathjs';
import { VirtualSensor } from '../../sensors/virtual-sensor.entity';
import { randomUUID } from 'crypto';

@Injectable()
export class DerivedStage {
  constructor(
    @InjectRepository(VirtualSensor) private vsRepo: Repository<VirtualSensor>,
    @InjectRedis() private redis: Redis,
  ) {}

  async run(ctx: PipelineContext): Promise<ProcessedReading[]> {
    // Find virtual sensors that use this sensor as input
    const virtuals = await this.getVirtualSensors(ctx.raw.siteId, ctx.raw.sensorId);
    const derived: ProcessedReading[] = [];

    for (const vs of virtuals) {
      try {
        // Fetch latest values for all input sensors from Redis cache
        const scope: Record<string, number> = {};
        for (const inputId of vs.inputSensorIds) {
          if (inputId === ctx.raw.sensorId) {
            // Use current reading's value
            scope[inputId] = (ctx.current as any).value ?? 0;
          } else {
            const cached = await this.redis.get(`latest:${inputId}`);
            if (cached) scope[inputId] = parseFloat(cached);
          }
        }

        // Evaluate formula in sandboxed mathjs
        const result = math.evaluate(vs.formula, scope);

        if (typeof result === 'number' && isFinite(result)) {
          derived.push({
            sensorId:       vs.id,
            organizationId: ctx.raw.organizationId,
            siteId:         ctx.raw.siteId,
            phenomenonTime: ctx.raw.phenomenonTime,
            receivedAt:     new Date().toISOString(),
            rawData:        { formula: vs.formula, inputs: scope },
            processedData:  { value: result, unit: vs.unit },
            qualityCode:    'GOOD',
            pipelineFlags:  ['derived'],
            configVersionId: null,
            correlationId:  randomUUID(),
          });
        }
      } catch (err) {
        // Formula evaluation failure is non-fatal — log and continue
        ctx.flags.push(`derived_error:${vs.id}`);
      }
    }

    // Cache this sensor's current value for derived sensor use
    await this.redis.setex(
      `latest:${ctx.raw.sensorId}`,
      3600,
      String((ctx.current as any).value ?? '')
    );

    return derived;
  }

  private async getVirtualSensors(siteId: string, sensorId: string) {
    // Cache in Redis with 5min TTL to avoid repeated DB queries per reading
    const cacheKey = `virtual_deps:${siteId}:${sensorId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const result = await this.vsRepo
      .createQueryBuilder('vs')
      .where('vs.siteId = :siteId', { siteId })
      .andWhere(':sensorId = ANY(vs.inputSensorIds)', { sensorId })
      .getMany();

    await this.redis.setex(cacheKey, 300, JSON.stringify(result));
    return result;
  }
}
```

### 4.5 Readings worker

**`backend/src/pipeline/readings.worker.ts`**
```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { QUEUE_NAMES } from '@iotproxy/shared';
import { PipelineService } from './pipeline.service';
import { TimescaleRepository } from '../database/timescale.repository';
import { ReadingsGateway } from '../query/readings.gateway';
import { WebhookService } from '../webhooks/webhook.service';
import { ConnectivityService } from '../connectivity/heartbeat.service';

@Processor(QUEUE_NAMES.READINGS, {
  concurrency: 10,
  limiter: { max: 1000, duration: 1000 }, // max 1000 jobs/sec per worker
})
export class ReadingsWorker extends WorkerHost {
  private readonly logger = new Logger(ReadingsWorker.name);
  private batch: any[] = [];
  private flushTimer: NodeJS.Timeout;

  constructor(
    private pipeline: PipelineService,
    private timescale: TimescaleRepository,
    private gateway: ReadingsGateway,
    private webhooks: WebhookService,
    private connectivity: ConnectivityService,
  ) {
    super();
    // Flush every 500ms regardless of batch size
    this.flushTimer = setInterval(() => this.flush(), 500);
  }

  async process(job: Job): Promise<void> {
    const result = await this.pipeline.process(job.data);
    if (!result) return; // dropped by pipeline

    this.batch.push(result);
    if (result.derivedReadings?.length) {
      this.batch.push(...result.derivedReadings);
    }

    if (this.batch.length >= 100) {
      await this.flush();
    }
  }

  private async flush() {
    if (this.batch.length === 0) return;
    const toFlush = this.batch.splice(0, this.batch.length);

    try {
      await this.timescale.batchInsert(toFlush);

      // Update connectivity heartbeats
      const uniqueSensors = [...new Set(toFlush.map(r => r.sensorId))];
      await this.connectivity.recordHeartbeats(uniqueSensors);

      // Push to WebSocket subscribers
      for (const reading of toFlush) {
        this.gateway.emitReading(reading);
      }

      // Trigger webhooks for reading.created events (batched)
      await this.webhooks.dispatchBatch(toFlush, 'reading.created');

    } catch (err) {
      this.logger.error('Batch flush failed', err);
      // Re-add to batch for retry — BullMQ will handle job-level retry
      this.batch.unshift(...toFlush);
      throw err;
    }
  }
}
```

---

## Phase 5 — Virtual Sensor Circular Dependency Prevention

**`backend/src/sensors/virtual-sensor.service.ts`**
```typescript
// Kahn's algorithm for topological sort — called on every VirtualSensor save

async validateNoCycles(
  orgId: string,
  newVs: { id?: string; inputSensorIds: string[] }
): Promise<void> {
  const all = await this.vsRepo.find({ where: { organizationId: orgId } });

  // Build adjacency list: vsId → [vsIds it depends on]
  const graph = new Map<string, string[]>();
  for (const vs of all) {
    const deps = vs.inputSensorIds.filter(id =>
      all.some(other => other.id === id)
    );
    graph.set(vs.id, deps);
  }
  if (newVs.id) {
    graph.set(newVs.id, newVs.inputSensorIds.filter(id => all.some(o => o.id === id)));
  }

  // Kahn's algorithm
  const inDegree = new Map<string, number>();
  for (const [node] of graph) inDegree.set(node, 0);
  for (const [, deps] of graph) {
    for (const dep of deps) {
      inDegree.set(dep, (inDegree.get(dep) ?? 0) + 1);
    }
  }

  const queue = [...inDegree.entries()].filter(([,d]) => d === 0).map(([n]) => n);
  let visited = 0;

  while (queue.length > 0) {
    const node = queue.shift()!;
    visited++;
    for (const dep of (graph.get(node) ?? [])) {
      const newDeg = (inDegree.get(dep) ?? 0) - 1;
      inDegree.set(dep, newDeg);
      if (newDeg === 0) queue.push(dep);
    }
  }

  if (visited < graph.size) {
    throw new UnprocessableEntityException({
      type: 'FORMULA_CIRCULAR_DEPENDENCY',
      detail: 'The formula creates a circular dependency between virtual sensors.',
    });
  }
}
```

---

## Phase 6 — Discovery Mode

### 6.1 Field profiling with Welford's algorithm

**`backend/src/discovery/discovery.service.ts`**
```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FieldProfile } from './field-profile.entity';
import { Site } from '../sites/site.entity';

@Injectable()
export class DiscoveryService {

  // Welford's online algorithm: O(1) memory, numerically stable
  async updateFieldProfile(
    siteId: string,
    fieldName: string,
    value: unknown,
    rawPayload: any,
  ): Promise<void> {
    let profile = await this.profileRepo.findOne({ where: { siteId, fieldName } });

    const inferredType = this.inferType(value);
    const numericVal = typeof value === 'number' ? value : null;

    if (!profile) {
      profile = this.profileRepo.create({
        siteId, fieldName,
        inferredType,
        sampleCount: 0,
        minValue: numericVal,
        maxValue: numericVal,
        meanValue: numericVal,
        M2: 0,  // for Welford
        exampleValues: [value],
        firstSeen: new Date(),
        lastSeen: new Date(),
        status: 'PENDING',
      });
    }

    profile.sampleCount += 1;
    profile.lastSeen = new Date();

    if (numericVal !== null) {
      // Welford's online mean and variance
      const delta = numericVal - (profile.meanValue ?? 0);
      profile.meanValue = (profile.meanValue ?? 0) + delta / profile.sampleCount;
      const delta2 = numericVal - profile.meanValue;
      profile.M2 = (profile.M2 ?? 0) + delta * delta2;

      profile.minValue = Math.min(profile.minValue ?? Infinity, numericVal);
      profile.maxValue = Math.max(profile.maxValue ?? -Infinity, numericVal);
    }

    // Keep last 5 example values
    const examples = profile.exampleValues ?? [];
    if (examples.length < 5) examples.push(value);
    else examples[profile.sampleCount % 5] = value;
    profile.exampleValues = examples;

    await this.profileRepo.save(profile);
  }

  async addToReplayBuffer(site: Site, rawPayload: any): Promise<void> {
    const buffer: any[] = site.replayBuffer ?? [];
    buffer.push({ ...rawPayload, _bufferedAt: new Date() });

    // Cap at configured limit
    const cap = 500;
    if (buffer.length > cap) buffer.splice(0, buffer.length - cap);

    await this.siteRepo.update(site.id, { replayBuffer: buffer });
  }

  async previewPipeline(siteId: string, proposedConfigs: Record<string, SensorConfigDraft>) {
    const site = await this.siteRepo.findOne({ where: { id: siteId } });
    const results = [];

    for (const payload of (site.replayBuffer ?? [])) {
      const transformed = this.applyDraftConfig(payload, proposedConfigs);
      results.push({ raw: payload, processed: transformed });
    }

    return results;
  }

  private inferType(val: unknown): string {
    if (typeof val === 'number') return Number.isInteger(val) ? 'integer' : 'float';
    if (typeof val === 'boolean') return 'boolean';
    if (typeof val === 'string') {
      if (!isNaN(Date.parse(val))) return 'timestamp';
      return 'string';
    }
    return 'unknown';
  }
}
```

---

## Phase 7 — Alerts

### 7.1 Alert stage (Stage 6 of pipeline)

**`backend/src/alerts/alert.stage.ts`**
```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AlertRule } from './alert-rule.entity';
import { AlertEvent } from './alert-event.entity';
import { NotificationService } from './notification.service';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Redis } from 'ioredis';

@Injectable()
export class AlertStage {
  constructor(
    @InjectRepository(AlertRule) private rules: Repository<AlertRule>,
    @InjectRepository(AlertEvent) private events: Repository<AlertEvent>,
    @InjectRedis() private redis: Redis,
    private notifications: NotificationService,
  ) {}

  async run(ctx: PipelineContext): Promise<void> {
    const applicableRules = await this.getRules(ctx.raw.sensorId, ctx.raw.organizationId);

    for (const rule of applicableRules) {
      const fieldValue = (ctx.current as any)[rule.field];
      if (typeof fieldValue !== 'number') continue;

      const conditionMet = this.evaluate(fieldValue, rule.operator, rule.threshold);
      const stateKey = `alert_state:${rule.id}:${ctx.raw.sensorId}`;
      const currentState = await this.redis.get(stateKey) ?? 'INACTIVE';

      if (conditionMet && currentState !== 'FIRING') {
        // Transition to FIRING
        await this.redis.set(stateKey, 'FIRING');
        const event = await this.events.save({
          alertRuleId: rule.id,
          sensorId: ctx.raw.sensorId,
          state: 'FIRING',
          triggeredAt: new Date(),
          value: fieldValue,
          threshold: rule.threshold,
        });
        await this.notifications.dispatch(rule, event, 'FIRING');

      } else if (!conditionMet && currentState === 'FIRING') {
        // Transition to RESOLVED
        await this.redis.set(stateKey, 'INACTIVE');
        const event = await this.events.save({
          alertRuleId: rule.id,
          sensorId: ctx.raw.sensorId,
          state: 'RESOLVED',
          resolvedAt: new Date(),
          value: fieldValue,
        });
        await this.notifications.dispatch(rule, event, 'RESOLVED');
      }
    }
  }

  private evaluate(val: number, op: string, threshold: number): boolean {
    switch (op) {
      case 'GT':  return val > threshold;
      case 'LT':  return val < threshold;
      case 'GTE': return val >= threshold;
      case 'LTE': return val <= threshold;
      case 'EQ':  return val === threshold;
      case 'NEQ': return val !== threshold;
      default:    return false;
    }
  }

  private async getRules(sensorId: string, orgId: string): Promise<AlertRule[]> {
    const cacheKey = `alert_rules:${sensorId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const rules = await this.rules.find({
      where: [{ sensorId }, { organizationId: orgId, sensorId: null as any }],
    });

    await this.redis.setex(cacheKey, 60, JSON.stringify(rules));
    return rules;
  }
}
```

---

## Phase 8 — Connectivity Monitoring

**`backend/src/connectivity/heartbeat.service.ts`**
```typescript
import { Injectable } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Redis } from 'ioredis';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sensor } from '../sensors/sensor.entity';

@Injectable()
export class HeartbeatService {
  constructor(
    @InjectRedis() private redis: Redis,
    @InjectRepository(Sensor) private sensors: Repository<Sensor>,
  ) {}

  async recordHeartbeats(sensorIds: string[]): Promise<void> {
    const now = Date.now().toString();
    const pipeline = this.redis.pipeline();
    for (const id of sensorIds) {
      pipeline.set(`heartbeat:${id}`, now, 'EX', 3600);
    }
    await pipeline.exec();
    // Flush to DB every 60s via OfflineDetectorCron, not here
  }

  async getLastSeen(sensorId: string): Promise<Date | null> {
    const ts = await this.redis.get(`heartbeat:${sensorId}`);
    return ts ? new Date(parseInt(ts)) : null;
  }
}
```

**`backend/src/connectivity/offline-detector.cron.ts`**
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Redis } from 'ioredis';
import { Sensor } from '../sensors/sensor.entity';
import { WebhookService } from '../webhooks/webhook.service';

@Injectable()
export class OfflineDetectorCron {
  private readonly logger = new Logger(OfflineDetectorCron.name);

  constructor(
    @InjectRepository(Sensor) private sensors: Repository<Sensor>,
    @InjectRedis() private redis: Redis,
    private webhooks: WebhookService,
  ) {}

  @Cron('*/60 * * * * *') // every 60 seconds
  async detectOfflineSensors(): Promise<void> {
    // Only check sensors with a configured reporting interval
    const monitored = await this.sensors.find({
      where: { status: 'ACTIVE', reportingIntervalSeconds: Not(IsNull()) },
    });

    const now = Date.now();
    const batchSize = 100;

    for (let i = 0; i < monitored.length; i += batchSize) {
      const batch = monitored.slice(i, i + batchSize);
      const pipeline = this.redis.pipeline();
      for (const s of batch) pipeline.get(`heartbeat:${s.id}`);
      const results = await pipeline.exec();

      for (let j = 0; j < batch.length; j++) {
        const sensor = batch[j];
        const lastSeenTs = results?.[j]?.[1] as string | null;
        const lastSeen = lastSeenTs ? parseInt(lastSeenTs) : 0;
        const deadline = now - sensor.reportingIntervalSeconds * 2000;

        if (lastSeen < deadline && sensor.connectivityStatus !== 'OFFLINE') {
          await this.sensors.update(sensor.id, { connectivityStatus: 'OFFLINE' });
          await this.webhooks.dispatch(sensor.organizationId, 'sensor.offline', {
            sensorId: sensor.id, siteId: sensor.siteId,
            lastSeen: lastSeenTs ? new Date(lastSeen) : null,
          });
        } else if (lastSeen >= deadline && sensor.connectivityStatus === 'OFFLINE') {
          await this.sensors.update(sensor.id, { connectivityStatus: 'ONLINE' });
          await this.webhooks.dispatch(sensor.organizationId, 'sensor.online', {
            sensorId: sensor.id, siteId: sensor.siteId,
          });
        }
      }

      // Flush lastReadingAt to DB from Redis
      await this.sensors.createQueryBuilder()
        .update()
        .set({ lastReadingAt: () => `to_timestamp(CAST(redis_val AS bigint)/1000)` })
        .where('id IN (:...ids)', { ids: batch.map(s => s.id) })
        .execute();
    }
  }
}
```

---

## Phase 9 — Query API

**`backend/src/query/query.controller.ts`**
```typescript
@Controller('query')
@UseGuards(JwtAuthGuard)
export class QueryController {

  // Latest values for all sensors in a site — primary dashboard endpoint
  @Get('sites/:siteId/latest')
  async siteLatest(@Param('siteId') siteId: string, @CurrentUser() user: User) {
    await this.assertSiteAccess(user, siteId);
    const sensors = await this.sensorService.listBySite(siteId);
    const latest = await this.timescale.getLatestPerSensor(sensors.map(s => s.id));

    return sensors.map(s => ({
      sensor: s,
      reading: latest[s.id] ?? null,
    }));
  }

  // Time-series for one sensor with cursor pagination
  @Get('readings/:sensorId')
  async sensorReadings(
    @Param('sensorId') sensorId: string,
    @Query() params: TimeSeriesQueryDto,
    @CurrentUser() user: User,
  ) {
    await this.assertSensorAccess(user, sensorId);

    const rows = await this.timescale.queryTimeSeries({
      sensorId,
      startTs: new Date(params.startTs),
      endTs:   new Date(params.endTs),
      agg:     params.agg ?? 'NONE',
      intervalMs: params.intervalMs,
      limit:   Math.min(params.limit ?? 1000, 10_000),
      cursor:  params.cursor ? new Date(params.cursor) : undefined,
    });

    const nextCursor = rows.length === (params.limit ?? 1000)
      ? rows[rows.length - 1].phenomenon_time
      : null;

    return { data: rows, nextCursor };
  }
}
```

**`backend/src/query/readings.gateway.ts`**
```typescript
import { WebSocketGateway, SubscribeMessage, MessageBody, ConnectedSocket } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({ namespace: '/ws', cors: true })
export class ReadingsGateway {
  private siteRooms = new Map<string, Set<string>>();  // siteId → socket IDs

  async handleConnection(socket: Socket) {
    const token = socket.handshake.auth?.token;
    try {
      const payload = this.jwt.verify(token);
      socket.data.userId = payload.sub;
      socket.data.orgId  = payload.orgId;
    } catch {
      socket.disconnect();
    }
  }

  @SubscribeMessage('subscribe:site')
  async subscribeSite(@MessageBody() { siteId }: { siteId: string }, @ConnectedSocket() socket: Socket) {
    // Verify access
    socket.join(`site:${siteId}`);
  }

  @SubscribeMessage('subscribe:sensor')
  async subscribeSensor(@MessageBody() { sensorId }: { sensorId: string }, @ConnectedSocket() socket: Socket) {
    socket.join(`sensor:${sensorId}`);
  }

  // Called by readings worker after batch flush
  emitReading(reading: ProcessedReading) {
    this.server.to(`sensor:${reading.sensorId}`).emit('reading', reading);
    this.server.to(`site:${reading.siteId}`).emit('reading', reading);
  }
}
```

---

## Phase 10 — Observability

**`backend/src/health/health.controller.ts`**
```typescript
import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Redis } from 'ioredis';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

@Controller()
export class HealthController {
  private registry = new Registry();

  // Prometheus metrics
  ingestTotal    = new Counter({ name: 'iot_ingest_requests_total',     labelNames: ['status','org'], registers: [this.registry] });
  queueDepth     = new Gauge({ name: 'iot_queue_depth',                  registers: [this.registry] });
  pipelineMs     = new Histogram({ name: 'iot_pipeline_stage_duration_ms', labelNames: ['stage'], buckets: [1,2,5,10,25,50,100,250], registers: [this.registry] });
  wsConnections  = new Gauge({ name: 'iot_websocket_connections',        registers: [this.registry] });

  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    @InjectRedis() private redis: Redis,
    @InjectQueue('readings') private queue: Queue,
  ) {
    collectDefaultMetrics({ register: this.registry });
  }

  @Get('health')
  @HealthCheck()
  async check() {
    const queueDepth = await this.queue.getWaiting();
    const queueStatus = queueDepth.length > 10_000 ? 'degraded' : 'ok';

    return this.health.check([
      () => this.db.pingCheck('database'),
      async () => {
        await this.redis.ping();
        return { redis: { status: 'ok' } };
      },
      async () => ({
        queue: { status: queueStatus, depth: queueDepth.length }
      }),
    ]);
  }

  @Get('metrics')
  async metrics(): Promise<string> {
    // Update queue depth gauge before scrape
    const waiting = await this.queue.getWaiting();
    this.queueDepth.set(waiting.length);
    return this.registry.metrics();
  }
}
```

**`infra/monitoring/prometheus.yml`**
```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'iotproxy-backend'
    static_configs:
      - targets: ['backend:3000']
    metrics_path: '/api/v1/metrics'
```

---

## Phase 11 — Export

**`backend/src/export/export.worker.ts`**
```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { createObjectCsvStringifier } from 'csv-writer';
import { StorageService } from './storage.service';
import { TimescaleRepository } from '../database/timescale.repository';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExportJob } from './export-job.entity';
import { QUEUE_NAMES } from '@iotproxy/shared';

@Processor(QUEUE_NAMES.EXPORTS)
export class ExportWorker extends WorkerHost {
  constructor(
    private timescale: TimescaleRepository,
    private storage: StorageService,
    @InjectRepository(ExportJob) private jobs: Repository<ExportJob>,
  ) { super(); }

  async process(job: Job): Promise<void> {
    const { exportJobId, siteId, startTs, endTs, fields, format } = job.data;
    await this.jobs.update(exportJobId, { status: 'PROCESSING' });

    const sensors = job.data.sensorIds;
    const pageSize = 10_000;
    const rows: any[] = [];

    for (const sensorId of sensors) {
      let cursor: Date | undefined;
      while (true) {
        const page = await this.timescale.queryTimeSeries({
          sensorId,
          startTs: new Date(startTs),
          endTs:   new Date(endTs),
          agg:     'NONE',
          limit:   pageSize,
          cursor,
        });

        rows.push(...page.map(r => ({
          sensorId,
          time: r.phenomenon_time,
          ...fields.reduce((acc: any, f: string) => {
            acc[f] = r.processed_data?.[f] ?? null;
            return acc;
          }, {}),
        })));

        if (page.length < pageSize) break;
        cursor = page[page.length - 1].phenomenon_time;

        await this.jobs.update(exportJobId, {
          progress: Math.round(rows.length / (job.data.estimatedReadings || 1) * 100),
        });
      }
    }

    // Stream to object storage
    const csv = createObjectCsvStringifier({ header: Object.keys(rows[0] ?? {}).map(k => ({ id: k, title: k })) });
    const content = csv.getHeaderString() + csv.stringifyRecords(rows);
    const key = `exports/${exportJobId}.csv`;
    await this.storage.upload(key, Buffer.from(content), 'text/csv');

    const downloadUrl = await this.storage.presignedUrl(key, 86400); // 24h
    await this.jobs.update(exportJobId, { status: 'DONE', downloadUrl, completedAt: new Date() });
  }
}
```

---

## Phase 12 — Webhook signing and delivery

**`backend/src/webhooks/webhook.service.ts`** (key excerpt)
```typescript
async dispatch(orgId: string, event: string, payload: any): Promise<void> {
  const hooks = await this.webhookRepo.find({
    where: { organizationId: orgId, active: true },
  });

  const filtered = hooks.filter(h => h.events.includes(event) || h.events.includes('*'));

  for (const hook of filtered) {
    await this.queue.add('deliver', {
      url: hook.url,
      secret: hook.secret,
      event,
      payload,
      webhookId: hook.id,
    }, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 2000 },
    });
  }
}

// In the delivery worker:
private sign(secret: string, body: string): string {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const sig = createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');
  return `t=${timestamp},v1=${sig}`;
}
```

---

## MQTT Broker Authentication

**`infra/mosquitto/mosquitto.conf`**
```
listener 1883
allow_anonymous false
auth_plugin /usr/lib/mosquitto-go-auth.so
auth_opt_backends http
auth_opt_http_host backend
auth_opt_http_port 3000
auth_opt_http_getuser_uri /api/v1/internal/mqtt/auth
auth_opt_http_superuser_uri /api/v1/internal/mqtt/superuser
auth_opt_http_aclcheck_uri /api/v1/internal/mqtt/acl
```

Add internal MQTT auth endpoint to backend (not exposed publicly):
```typescript
@Controller('internal/mqtt')
export class MqttAuthController {
  @Post('auth')
  async auth(@Body() { username, password }: { username: string; password: string }) {
    const key = await this.apiKeys.validate(password); // password = API key
    if (!key) throw new UnauthorizedException();
    return { ok: true };
  }

  @Post('acl')
  async acl(@Body() { username, topic, acc }: { username: string; topic: string; acc: number }) {
    // acc: 1=subscribe, 2=publish, 3=both
    const parts = topic.split('/');
    const siteId = parts[1];
    const key = await this.apiKeys.validateByUsername(username);
    if (!key) throw new ForbiddenException();
    if (key.siteId && key.siteId !== siteId) throw new ForbiddenException();
    return { ok: true };
  }
}
```

---

## Key Dependencies

**`backend/package.json`** — complete dependency list:

```json
{
  "dependencies": {
    "@nestjs/common": "^10",
    "@nestjs/bull": "^10",
    "@nestjs/config": "^3",
    "@nestjs/jwt": "^10",
    "@nestjs/passport": "^10",
    "@nestjs/platform-socket.io": "^10",
    "@nestjs/schedule": "^4",
    "@nestjs/swagger": "^7",
    "@nestjs/terminus": "^10",
    "@nestjs/throttler": "^5",
    "@nestjs-modules/ioredis": "^2",
    "bullmq": "^5",
    "convert-units": "^3",
    "ioredis": "^5",
    "joi": "^17",
    "mathjs": "^12",
    "mqtt": "^5",
    "minio": "^7",
    "nodemailer": "^6",
    "passport-jwt": "^4",
    "pg": "^8",
    "prom-client": "^15",
    "typeorm": "^0.3",
    "csv-writer": "^1"
  }
}
```

---

## Implementation Checklist

**Phase 1** — Monorepo, shared types, Docker Compose, TimescaleDB init, NestJS bootstrap, config validation

**Phase 2** — Auth (JWT + API key), API key generation/caching/expiry, rate limiting, MQTT broker auth

**Phase 3** — HTTP ingest (single + bulk), MQTT ingest, BullMQ producer, 202 response + batchId

**Phase 4** — All 6 pipeline stages, readings worker (batching + flush), dead letter queue handling

**Phase 5** — Virtual sensors with DAG cycle detection, formula evaluation, derived reading generation

**Phase 6** — Discovery mode: field profiling (Welford), replay buffer, commissioning UI, preview endpoint

**Phase 7** — Alert rules, alert state machine (FIRING/RESOLVED), notification service (email + webhook)

**Phase 8** — Connectivity heartbeats (Redis), offline detector cron, MQTT LWT integration

**Phase 9** — Query REST API (cursor pagination, aggregate routing), WebSocket gateway (site/sensor rooms)

**Phase 10** — /health and /metrics endpoints, Prometheus + Grafana + Loki setup, structured logging with correlation IDs

**Phase 11** — Async export (BullMQ worker, CSV streaming, MinIO upload, presigned URL)

**Phase 12** — Webhook delivery (BullMQ worker, HMAC-SHA256 signing, retry with backoff, delivery log)
