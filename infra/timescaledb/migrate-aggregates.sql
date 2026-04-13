-- ============================================================
-- Migration: Update continuous aggregates to support any field
-- Run this on existing databases to fix chart data display
-- ============================================================

-- Drop existing continuous aggregates
DROP MATERIALIZED VIEW IF NOT EXISTS readings_1d CASCADE;
DROP MATERIALIZED VIEW IF NOT EXISTS readings_1h CASCADE;

-- Recreate hourly aggregate with flexible field support
CREATE MATERIALIZED VIEW readings_1h
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
  COUNT(*) AS sample_count
FROM sensor_readings
WHERE quality_code IN ('GOOD', 'UNCERTAIN')
  AND jsonb_typeof(processed_data) = 'object'
GROUP BY 1, sensor_id, site_id, organization_id;

-- Add policies for hourly aggregate
SELECT add_continuous_aggregate_policy('readings_1h',
  start_offset      => INTERVAL '3 hours',
  end_offset        => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists     => TRUE);

SELECT add_retention_policy('readings_1h',
  drop_after    => INTERVAL '2 years',
  if_not_exists => TRUE);

-- Recreate daily aggregate
CREATE MATERIALIZED VIEW readings_1d
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
GROUP BY 1, sensor_id, site_id, organization_id;

-- Add policies for daily aggregate
SELECT add_continuous_aggregate_policy('readings_1d',
  start_offset      => INTERVAL '3 days',
  end_offset        => INTERVAL '1 day',
  schedule_interval => INTERVAL '1 day',
  if_not_exists     => TRUE);

SELECT add_retention_policy('readings_1d',
  drop_after    => INTERVAL '5 years',
  if_not_exists => TRUE);

-- Refresh aggregates to populate with existing data
CALL refresh_continuous_aggregate('readings_1h', NULL, NULL);
CALL refresh_continuous_aggregate('readings_1d', NULL, NULL);
