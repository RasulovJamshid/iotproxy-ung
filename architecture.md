# IoT Proxy Platform — Architecture

## Overview

The IoT Proxy Platform is a multi-tenant, high-throughput data ingestion and normalization system acting as a proxy between multiple sensor sites and one or more end services (dashboards, analytics). Sites push sensor readings; the platform normalizes, validates, transforms, and stores them; end services pull or subscribe to the processed data.

---

## System Context

```
Sites (N × ~1000 sensors)
  │ HTTP POST /api/v1/ingest/readings
  │ MQTT publish sites/{id}/readings
  ▼
IoT Proxy Platform ◄─── Operator UI (React)
  │ REST GET /api/v1/query/*
  │ WebSocket /ws
  ▼
End Services (dashboards, analytics, alerting)
```

The platform is the single source of truth for all sensor data. Sites never communicate directly with end services.

---

## Architecture Principles

**1. Ingest and query are separate paths.** Write throughput (thousands of readings/sec) and read latency (sub-100ms dashboard queries) have opposite scaling profiles. They share a database but use separate controllers, services, and — eventually — can be separate deployable units.

**2. The ingest path is always async.** HTTP and MQTT ingest endpoints validate, enqueue to BullMQ, and return 202 immediately. The database is never in the critical path for a site's POST request.

**3. One writer: the readings worker.** Only `readings.worker.ts` writes to the `sensor_readings` hypertable. This serializes batch inserts, prevents lock contention, and makes throughput tuning a single-knob operation (worker concurrency).

**4. Two data access patterns coexist.** Prisma/TypeORM handles all management data (relational, low-write). Raw `pg` pool handles all time-series data (high-write, TimescaleDB-specific SQL).

**5. Config versioning is immutable.** Every `SensorConfig` change creates a new version record. Every reading row carries the `configVersionId` that processed it. Historical data is always reinterpretable.

---

## Technology Stack

| Concern | Technology | Reason |
|---|---|---|
| Backend framework | NestJS (TypeScript) | Modular, DI, native BullMQ/WebSocket support |
| Management DB | PostgreSQL via TypeORM + Prisma | Relational, migrations, type safety |
| Time-series DB | TimescaleDB (PostgreSQL extension) | Hypertables, continuous aggregates, compression |
| Write queue | BullMQ + Redis | NestJS-native, reliable, observable |
| API key cache | Redis | 60s TTL, removes per-request DB lookup |
| MQTT broker | Mosquitto + mosquitto-go-auth | Lightweight, auth hook for API key validation |
| Formula engine | mathjs | Sandboxed expression evaluation for virtual sensors |
| Frontend | React + TypeScript + Tailwind + React Query | Component ecosystem, server state management |
| Observability | Prometheus + Grafana + Loki + Promtail | Industry standard, self-hosted |
| Container | Docker Compose (dev) / Kubernetes (prod) | Dev simplicity, prod scalability |

---

## Monorepo Structure

```
iotproxy/
├── backend/                  NestJS application
│   ├── src/
│   │   ├── config/           Typed env config + Joi validation
│   │   ├── database/         TypeORM setup + raw TimescaleDB repository
│   │   ├── auth/             JWT + API key strategies, guards, decorators
│   │   ├── organizations/    Tenant management
│   │   ├── sites/            Site entity + commissioning status machine
│   │   ├── sensors/          Sensor registry, config, virtual sensors, tags
│   │   ├── discovery/        Field profiling engine, commissioning workflow
│   │   ├── ingest/           HTTP + MQTT entry points, BullMQ producer
│   │   ├── pipeline/         6-stage normalization pipeline + readings worker
│   │   ├── query/            REST read API + WebSocket gateway
│   │   ├── alerts/           Threshold rules, alert state machine, notifications
│   │   ├── connectivity/     Site/sensor online status, offline detection cron
│   │   ├── export/           Async CSV/Parquet export to object storage
│   │   ├── webhooks/         Outbound event notifications with HMAC signing
│   │   ├── api-keys/         Key lifecycle, Redis caching, rotation enforcement
│   │   ├── admin/            System admin endpoints, audit log, health, metrics
│   │   ├── health/           /health + /metrics (Prometheus) endpoints
│   │   └── common/           DTOs, interceptors, filters, decorators
│   ├── prisma/               Schema for management tables
│   └── test/                 E2E + integration tests
├── frontend/
│   └── src/
│       ├── api/              Typed axios client + WebSocket wrapper
│       ├── pages/            One file per route
│       ├── components/       Reusable UI: charts, badges, editors, modals
│       ├── contexts/         AuthContext, OrgContext
│       └── hooks/            React Query hooks for all data fetching
├── shared/
│   ├── types/                Canonical TypeScript interfaces (used by both)
│   └── constants/            Enums, error codes, permission constants
└── infra/
    ├── docker/               docker-compose.dev.yml, docker-compose.prod.yml
    ├── timescaledb/          init.sql (hypertable + compression + retention)
    ├── redis/                redis.conf (memory policy, AOF)
    ├── mosquitto/            mosquitto.conf (auth hook config)
    ├── monitoring/           Prometheus, Grafana dashboards, Loki/Promtail
    └── k8s/                  Kubernetes manifests for production
```

---

## Data Architecture

### Two database patterns

**Management tables** — handled by TypeORM + Prisma. Standard relational schema. Low write volume, high read variety.

```
organizations ──< sites ──< sensors ──< sensor_configs
                                    ──< sensor_config_versions
                                    ──< virtual_sensors
                                    ──< tags >──< sensor_tags
              ──< api_keys
              ──< webhooks
              ──< users
              ──< alert_rules ──< alert_events
              ──< export_jobs
audit_logs (append-only)
field_profiles (per site, during discovery)
```

**Time-series table** — `sensor_readings` hypertable, handled exclusively by raw `pg` pool.

```sql
CREATE TABLE sensor_readings (
  id              UUID DEFAULT gen_random_uuid(),
  sensor_id       UUID NOT NULL,
  organization_id UUID NOT NULL,
  site_id         UUID NOT NULL,
  phenomenon_time TIMESTAMPTZ NOT NULL,        -- device timestamp
  received_at     TIMESTAMPTZ NOT NULL,        -- server receipt time
  raw_data        JSONB NOT NULL,              -- original payload
  processed_data  JSONB NOT NULL,              -- after pipeline
  quality_code    TEXT NOT NULL DEFAULT 'GOOD',
  pipeline_flags  TEXT[] DEFAULT '{}',
  config_version_id UUID,                      -- which config processed this
  dedup_key       TEXT GENERATED ALWAYS AS     -- idempotency
    (sensor_id::text || phenomenon_time::text) STORED
);

SELECT create_hypertable('sensor_readings', 'phenomenon_time',
  chunk_time_interval => INTERVAL '1 week');

ALTER TABLE sensor_readings SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'sensor_id'
);

SELECT add_compression_policy('sensor_readings', INTERVAL '7 days');

CREATE UNIQUE INDEX ON sensor_readings (dedup_key);
```

### Continuous aggregates

Pre-materialized rollups eliminate re-aggregation on every dashboard query.

```sql
-- Hourly aggregate (auto-refreshes, kept 2 years)
CREATE MATERIALIZED VIEW readings_1h
WITH (timescaledb.continuous) AS
SELECT time_bucket('1 hour', phenomenon_time) AS bucket,
       sensor_id, site_id, organization_id,
       AVG((processed_data->>'value')::float)  AS avg_val,
       MIN((processed_data->>'value')::float)  AS min_val,
       MAX((processed_data->>'value')::float)  AS max_val,
       COUNT(*)                                AS sample_count
FROM sensor_readings
WHERE quality_code IN ('GOOD', 'UNCERTAIN')
GROUP BY bucket, sensor_id, site_id, organization_id;

SELECT add_continuous_aggregate_policy('readings_1h',
  start_offset => INTERVAL '3 hours',
  end_offset   => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour');

-- Daily aggregate (auto-refreshes, kept 5 years)
CREATE MATERIALIZED VIEW readings_1d
WITH (timescaledb.continuous) AS
SELECT time_bucket('1 day', bucket) AS bucket,
       sensor_id, site_id, organization_id,
       AVG(avg_val) AS avg_val, MIN(min_val) AS min_val,
       MAX(max_val) AS max_val, SUM(sample_count) AS sample_count
FROM readings_1h
GROUP BY time_bucket('1 day', bucket), sensor_id, site_id, organization_id;
```

**Query routing logic** in `timescale.repository.ts`:
- Range < 6 hours → raw `sensor_readings`
- Range 6 hours – 7 days → `readings_1h`
- Range > 7 days → `readings_1d`

---

## Data Flow

### Write path (ingest → storage)

```
Site
 │  HTTP POST /api/v1/ingest/readings  (or MQTT publish)
 ▼
IngestController / MqttIngestService
 │  1. Auth: FlexibleAuthGuard (Redis cache → DB fallback)
 │  2. Validate payload structure + size (max 1MB body, max 500 items)
 │  3. Rate limit: per API key sliding window via @nestjs/throttler + Redis
 │  4. Enqueue job to BullMQ 'readings' queue
 │  5. Return 202 Accepted + batchId
 ▼
BullMQ 'readings' queue (Redis)
 ▼
ReadingsWorker  (consumes in batches of 100, flushes every 500ms)
 │  For each reading:
 │  ├── Stage 1: ValidateStage   — schema, range, clock skew check
 │  ├── Stage 2: FilterStage     — sensor status check
 │  ├── Stage 3: TransformStage  — scale, offset, unit conversion, clamp
 │  ├── Stage 4: AliasStage      — field key remapping
 │  ├── Stage 5: DerivedStage    — virtual sensor formula evaluation
 │  └── Stage 6: AlertStage      — threshold rule evaluation
 │  Batch INSERT to sensor_readings (ON CONFLICT DO NOTHING on dedup_key)
 │  Emit WebSocket event to ReadingsGateway
 │  Trigger webhooks via WebhookService
 ▼
TimescaleDB sensor_readings hypertable
```

### Read path (end service → data)

```
End Service
 │  GET /api/v1/query/readings/:sensorId
 │      ?startTs=&endTs=&agg=AVG&interval=3600000
 │  — or —
 │  GET /api/v1/query/sites/:siteId/latest
 │  — or —
 │  WebSocket subscribe { siteId: "..." }
 ▼
QueryController / ReadingsGateway
 │  JWT auth (tenant-scoped access check)
 │  Route to correct aggregate view based on time range
 │  Apply sensor alias mapping to output keys
 ▼
TimescaleDB (sensor_readings | readings_1h | readings_1d)
```

### Discovery / commissioning flow

```
Operator creates Site (status = DISCOVERY, window = 24h)
 │
 ├── Site sends readings during window
 │     └── DiscoveryService: updates FieldProfile running stats (Welford)
 │                           appends to replayBuffer (cap: 500 entries)
 │
 ├── Window expires → status = REVIEW
 │
 ├── Operator reviews FieldProfiles in UI
 │     └── Confirms fields: sets alias, transform, validation range
 │         Previews: runs proposed config against replayBuffer
 │
 └── Operator activates → status = ACTIVE
       └── SensorConfig records created for all confirmed fields
           Sensors transition MAINTENANCE → ACTIVE
           Normal pipeline enforced from this point
```

---

## Security Architecture

### Authentication layers

| Client | Method | Scope |
|---|---|---|
| Site (HTTP ingest) | X-API-Key header | Organization + optional site scope |
| Site (MQTT) | MQTT username/password → mosquitto-go-auth HTTP hook | Validates against API key table |
| End service (query) | JWT Bearer token | Tenant-scoped, role-based |
| Operator UI | JWT Bearer + refresh token | ADMIN / USER / VIEWER roles |
| System admin | JWT + SYSTEM_ADMIN role | Cross-tenant |

### API key security

- Keys generated as `iot_` + 32 cryptographically random bytes (base58)
- Only the prefix (first 8 chars) is stored in plaintext (for display)
- Full key is bcrypt-hashed before storage
- Valid keys cached in Redis with 60s TTL
- Expiry enforced by background job (KeyExpiryCheckerCron, runs hourly)
- Notification webhook fired 7 days before expiry
- Revoked keys invalidate Redis cache immediately

### Rate limiting

Per API key, enforced at ingest controller before enqueue:
- Default: 10,000 requests per minute per key
- Configurable per organization via `rateLimitRpm` attribute
- Implemented via `@nestjs/throttler` with Redis store
- Returns 429 with `Retry-After` header and `RATE_LIMIT_EXCEEDED` error code

### Webhook signing

Outbound webhooks are signed with HMAC-SHA256:
```
signature = HMAC-SHA256(secret, timestamp + "." + body)
X-IoT-Signature: t=<timestamp>,v1=<signature>
```
Timestamp is included to prevent replay attacks (reject if > 5 minutes old).

---

## Observability Architecture

### Metrics (Prometheus + Grafana)

Exposed at `GET /metrics` (Prometheus format, scrape interval 15s).

Key metrics:
- `iot_ingest_requests_total` — counter by method, status, org
- `iot_queue_depth` — gauge: BullMQ waiting job count
- `iot_pipeline_stage_duration_ms` — histogram by stage name
- `iot_readings_processed_total` — counter by quality_code
- `iot_worker_batch_size` — histogram
- `iot_timescale_insert_duration_ms` — histogram
- `iot_websocket_connections` — gauge
- `iot_alert_evaluations_total` — counter by rule, outcome

### Logging (Loki + Promtail)

Structured JSON logs with mandatory fields:
```json
{
  "level": "info",
  "timestamp": "2024-03-31T10:00:00.000Z",
  "correlationId": "uuid",
  "service": "readings-worker",
  "siteId": "...",
  "sensorId": "...",
  "message": "reading processed",
  "durationMs": 2.4,
  "pipelineFlags": ["unit_converted"]
}
```

Correlation ID is assigned at ingest and travels through: queue job metadata → worker → pipeline stages → DB insert → WebSocket emit.

### Health checks (`GET /health`)

```json
{
  "status": "ok",
  "checks": {
    "database": "ok",
    "redis": "ok",
    "mqtt_broker": "ok",
    "queue_depth": { "status": "ok", "depth": 142 },
    "worker_lag_ms": { "status": "ok", "value": 340 }
  }
}
```

Queue depth > 10,000 → `degraded`. Worker lag > 30s → `degraded`.

---

## Alert Architecture

### Alert rule model

```
AlertRule
  sensorId / siteId / organizationId   (scope)
  field                                 (which key in processedData)
  operator                              (GT, LT, GTE, LTE, EQ, NEQ)
  threshold                             (numeric value)
  windowSeconds                         (sustained duration before firing)
  severity                              (INFO, WARNING, CRITICAL)
  notificationChannels                  (email[], webhook[], slack[])
  cooldownSeconds                       (min time between re-fires)
```

### Alert state machine

```
INACTIVE ──(condition met for windowSeconds)──► FIRING
FIRING   ──(condition no longer met)──────────► RESOLVED
FIRING   ──(cooldown elapsed, still met)──────► FIRING (re-notify)
```

Alert evaluation happens in Stage 6 of the pipeline (AlertStage). Each evaluation checks the current reading against all rules scoped to that sensor. State transitions are written to `alert_events` table. Notifications dispatched via `notification.service.ts` (BullMQ job for resilience).

---

## Connectivity Monitoring

### Online/offline tracking

Every reading updates `sensor.lastReadingAt` (Redis write, flushed to DB every 60s). `OfflineDetectorCron` runs every 60 seconds:

```
FOR EACH active sensor WHERE reportingIntervalSeconds IS SET:
  IF now() - lastReadingAt > 2 × reportingIntervalSeconds:
    SET sensor.connectivityStatus = OFFLINE
    FIRE sensor.offline webhook
    CREATE alert_event (if offline alert rule exists)
```

For MQTT sites, `MqttEventsService` additionally listens to Mosquitto's `$SYS/broker/clients/connected` and LWT (Last Will and Testament) messages to detect site-level disconnects immediately, without waiting for the cron.

---

## Export Architecture

Exports are async BullMQ jobs that write to object storage (MinIO in self-hosted, S3 in cloud).

```
POST /api/v1/export
Body: { siteId, startTs, endTs, format: "csv"|"parquet", fields: [...] }
→ Returns { jobId, estimatedReadings }

ExportWorker:
  1. Query TimescaleDB in 10,000-row pages
  2. Apply sensor alias mapping
  3. Stream to MinIO/S3 as multipart upload
  4. On completion: update ExportJob status, fire download-ready webhook

GET /api/v1/export/:jobId
→ Returns { status, progress, downloadUrl (presigned, 24h TTL) }
```

---

## Deployment Architecture

### Development (Docker Compose)

All services in one compose file. Backend with hot reload. All ports exposed locally.

```
backend:3000   ← NestJS (HTTP + WebSocket)
frontend:5173  ← Vite dev server
timescaledb:5432
redis-bull:6379
redis-cache:6380
mosquitto:1883
grafana:3001  ← Monitoring UI (with monitoring compose)
```

### Production (Docker Compose or Kubernetes)

```
                    Nginx (443)
                   /           \
           /api/v1/*          /*
               |               |
           backend          frontend
          (3 replicas)      (Nginx static)
               |
        ┌──────┼──────┐
      TimescaleDB  Redis  Mosquitto
      (persistent  (AOF)  (TLS)
       volumes)
               |
       readings-worker
       (separate deployment,
        scale independently)
               |
       monitoring/
         Prometheus:9090
         Grafana:3001
         Loki:3100
```

The readings worker is deployed separately from the HTTP backend in production. This allows scaling write throughput independently of API request handling — add worker replicas when queue depth grows, not when HTTP traffic grows.

### Environment variables (required)

```
DATABASE_URL             TimescaleDB connection string
REDIS_BULL_URL           BullMQ Redis connection string
REDIS_CACHE_URL          API key/cache Redis connection string
MQTT_BROKER_URL          Mosquitto connection (backend MQTT client)
JWT_SECRET               Access token signing key (min 32 chars)
JWT_REFRESH_SECRET       Refresh token signing key (min 32 chars)
MINIO_ENDPOINT           Object storage for exports
MINIO_ACCESS_KEY
MINIO_SECRET_KEY
SMTP_HOST                Email for notifications
SMTP_PORT
SMTP_USER
SMTP_PASS
APP_BASE_URL             Used in notification links
RATE_LIMIT_DEFAULT_RPM   Default per-key rate limit (default: 10000)
DISCOVERY_WINDOW_HOURS   Default discovery window duration (default: 24)
CLOCK_SKEW_FUTURE_HOURS  Reject readings this many hours in future (default: 24)
CLOCK_SKEW_PAST_DAYS     Reject readings this many days in past (default: 30)
```

---

## API Versioning

All endpoints are prefixed `/api/v1/`. Breaking changes require a new version prefix. The version is part of the route from day one — never changed retroactively.

### Standardized error format (RFC 7807)

```json
{
  "type": "https://iotproxy.io/errors/SENSOR_DISABLED",
  "title": "Sensor is disabled",
  "status": 422,
  "detail": "Sensor TEMP-001 has status DISABLED. Enable it before sending readings.",
  "instance": "/api/v1/ingest/readings",
  "correlationId": "uuid"
}
```

Domain error codes: `SENSOR_DISABLED`, `SITE_NOT_IN_DISCOVERY`, `PAYLOAD_TOO_LARGE`, `TIMESTAMP_OUT_OF_BOUNDS`, `RATE_LIMIT_EXCEEDED`, `DUPLICATE_READING`, `FORMULA_CIRCULAR_DEPENDENCY`, `CONFIG_VERSION_CONFLICT`.

---

## Known Constraints and Design Decisions

**TimescaleDB chunk interval** defaults to 1 week. High-frequency sites (sub-5-second reporting, 1000 sensors) should set `chunk_time_interval` to 1 day at site activation. This is configurable via `site.timescaleChunkInterval` attribute, applied when the site's hypertable partition is created.

**Redis memory** is split into two logical concerns: BullMQ (durability required, uses AOF) and cache (ephemeral, uses allkeys-lru). In production, use two Redis instances or two separate Redis databases with memory limits to prevent BullMQ job eviction under cache pressure.

**Virtual sensor circular dependencies** are validated at save time using topological sort (Kahn's algorithm) across the full VirtualSensor DAG for the organization. A cycle causes a 422 `FORMULA_CIRCULAR_DEPENDENCY` error.

**Discovery window payload cap** is 500 raw payloads stored in `site.replayBuffer` (JSONB array). Individual reading rows are never written during discovery — only running statistics (FieldProfile) are updated. This bounds discovery storage to O(1) regardless of how long the window is open.

**Idempotency** is enforced by a generated `dedup_key` column (`sensor_id + phenomenon_time`). Duplicate inserts are silently ignored via `ON CONFLICT DO NOTHING`. Sites that retry failed requests will not produce duplicate data.
