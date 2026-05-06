-- ============================================================
-- Migration: Rebuild continuous aggregates
-- - Removes quality_code filter (was excluding MAINTENANCE readings)
-- - Widens refresh policy start_offset to 7d / 30d to handle gaps
-- Run on existing databases to fix chart data display.
-- ============================================================

DROP MATERIALIZED VIEW IF EXISTS readings_1d CASCADE;
DROP MATERIALIZED VIEW IF EXISTS readings_1h CASCADE;

-- Hourly aggregate — no quality filter, uses 'value' field.
-- Application-level aggregateRaw handles field auto-detection for sensors
-- that store data under non-standard field names.
CREATE MATERIALIZED VIEW readings_1h
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', phenomenon_time) AS bucket,
  sensor_id,
  site_id,
  organization_id,
  AVG((processed_data->>'value')::float8) AS avg_val,
  MIN((processed_data->>'value')::float8) AS min_val,
  MAX((processed_data->>'value')::float8) AS max_val,
  COUNT(*) AS sample_count
FROM sensor_readings
WHERE jsonb_typeof(processed_data) = 'object'
GROUP BY 1, sensor_id, site_id, organization_id;

-- Wide start_offset so the policy back-fills after any outage > 1 hour.
SELECT add_continuous_aggregate_policy('readings_1h',
  start_offset      => INTERVAL '7 days',
  end_offset        => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists     => TRUE);

SELECT add_retention_policy('readings_1h', drop_after => INTERVAL '2 years', if_not_exists => TRUE);

-- Daily aggregate built on top of the hourly view.
CREATE MATERIALIZED VIEW readings_1d
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 day', bucket) AS bucket,
  sensor_id,
  site_id,
  organization_id,
  AVG(avg_val)      AS avg_val,
  MIN(min_val)      AS min_val,
  MAX(max_val)      AS max_val,
  SUM(sample_count) AS sample_count
FROM readings_1h
GROUP BY 1, sensor_id, site_id, organization_id;

SELECT add_continuous_aggregate_policy('readings_1d',
  start_offset      => INTERVAL '30 days',
  end_offset        => INTERVAL '1 day',
  schedule_interval => INTERVAL '1 day',
  if_not_exists     => TRUE);

SELECT add_retention_policy('readings_1d', drop_after => INTERVAL '5 years', if_not_exists => TRUE);

-- Back-fill all historical data.
CALL refresh_continuous_aggregate('readings_1h', NULL, now() - INTERVAL '1 hour');
CALL refresh_continuous_aggregate('readings_1d', NULL, now() - INTERVAL '1 day');
