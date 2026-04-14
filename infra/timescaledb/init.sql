-- ============================================================
-- IoT Proxy — TimescaleDB initialization
-- Runs once on first container start via Docker volume mount
-- ============================================================

CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Main readings hypertable ─────────────────────────────────────────────────

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
  PRIMARY KEY (id, phenomenon_time)   -- compound PK required for hypertable partitioning
);

SELECT create_hypertable(
  'sensor_readings', 'phenomenon_time',
  chunk_time_interval => INTERVAL '1 week',
  if_not_exists       => TRUE
);

-- Idempotency: duplicate (sensor_id, phenomenon_time) pairs silently ignored
CREATE UNIQUE INDEX IF NOT EXISTS idx_readings_dedup
  ON sensor_readings (sensor_id, phenomenon_time);

-- Fast per-sensor time-range scans (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_readings_sensor_time
  ON sensor_readings (sensor_id, phenomenon_time DESC);

-- Org-scoped queries (admin / audit)
CREATE INDEX IF NOT EXISTS idx_readings_org_time
  ON sensor_readings (organization_id, phenomenon_time DESC);

-- ── Compression ──────────────────────────────────────────────────────────────

ALTER TABLE sensor_readings SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'sensor_id',
  timescaledb.compress_orderby   = 'phenomenon_time DESC'
);

SELECT add_compression_policy('sensor_readings',
  compress_after => INTERVAL '7 days',
  if_not_exists  => TRUE);

-- ── Default retention (90 days raw; per-org enforcement via nightly cron) ────

SELECT add_retention_policy('sensor_readings',
  drop_after    => INTERVAL '90 days',
  if_not_exists => TRUE);

-- ── Continuous aggregate: hourly ─────────────────────────────────────────────
-- Aggregates the first numeric value found in processed_data JSONB
-- Works with any field name (value, temperature, pressure, etc.)

CREATE MATERIALIZED VIEW IF NOT EXISTS readings_1h
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', phenomenon_time) AS bucket,
  sensor_id,
  site_id,
  organization_id,
  AVG(COALESCE(
    (processed_data->>'value')::float,
    (processed_data->>'temperature')::float,
    (processed_data->>'humidity')::float,
    (processed_data->>'pressure')::float,
    (processed_data->>'voltage')::float,
    (processed_data->>'current')::float,
    (processed_data->>'power')::float,
    (SELECT (value->>0)::float FROM jsonb_each_text(processed_data) WHERE value ~ '^-?[0-9]+\.?[0-9]*$' LIMIT 1)
  )) AS avg_val,
  MIN(COALESCE(
    (processed_data->>'value')::float,
    (processed_data->>'temperature')::float,
    (processed_data->>'humidity')::float,
    (processed_data->>'pressure')::float,
    (processed_data->>'voltage')::float,
    (processed_data->>'current')::float,
    (processed_data->>'power')::float,
    (SELECT (value->>0)::float FROM jsonb_each_text(processed_data) WHERE value ~ '^-?[0-9]+\.?[0-9]*$' LIMIT 1)
  )) AS min_val,
  MAX(COALESCE(
    (processed_data->>'value')::float,
    (processed_data->>'temperature')::float,
    (processed_data->>'humidity')::float,
    (processed_data->>'pressure')::float,
    (processed_data->>'voltage')::float,
    (processed_data->>'current')::float,
    (processed_data->>'power')::float,
    (SELECT (value->>0)::float FROM jsonb_each_text(processed_data) WHERE value ~ '^-?[0-9]+\.?[0-9]*$' LIMIT 1)
  )) AS max_val,
  COUNT(*)                                 AS sample_count
FROM sensor_readings
WHERE quality_code IN ('GOOD', 'UNCERTAIN')
  AND jsonb_typeof(processed_data) = 'object'
GROUP BY 1, sensor_id, site_id, organization_id
WITH NO DATA;

SELECT add_continuous_aggregate_policy('readings_1h',
  start_offset      => INTERVAL '3 hours',
  end_offset        => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists     => TRUE);

SELECT add_retention_policy('readings_1h',
  drop_after    => INTERVAL '2 years',
  if_not_exists => TRUE);

-- ── Continuous aggregate: daily (built from hourly, not raw) ─────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS readings_1d
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 day', bucket) AS bucket,
  sensor_id,
  site_id,
  organization_id,
  AVG(avg_val)          AS avg_val,
  MIN(min_val)          AS min_val,
  MAX(max_val)          AS max_val,
  SUM(sample_count)     AS sample_count
FROM readings_1h
GROUP BY 1, sensor_id, site_id, organization_id
WITH NO DATA;

SELECT add_continuous_aggregate_policy('readings_1d',
  start_offset      => INTERVAL '3 days',
  end_offset        => INTERVAL '1 day',
  schedule_interval => INTERVAL '1 day',
  if_not_exists     => TRUE);

SELECT add_retention_policy('readings_1d',
  drop_after    => INTERVAL '5 years',
  if_not_exists => TRUE);

-- ── Discovery payloads (separate table, not JSONB array on sites row) ────────

CREATE TABLE IF NOT EXISTS discovery_payloads (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id     UUID        NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload     JSONB       NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_discovery_payloads_site
  ON discovery_payloads (site_id, received_at DESC);
