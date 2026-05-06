-- ============================================================
-- Fix retention and compression policies on existing databases.
-- Run this once against your TimescaleDB instance.
-- ============================================================

-- 1. Remove the native 90-day raw retention policy.
--    This was silently dropping sensor_readings chunks without creating
--    daily summaries, causing data loss that bypassed the application.
SELECT remove_retention_policy('sensor_readings', if_not_exists => TRUE);

-- 2. Remove the 7-day compression policy.
--    Row-level DELETEs (used by per-sensor retention) on compressed chunks
--    require full chunk decompression first, which is extremely slow and can
--    cause timeouts. The application manages retention at the row level.
SELECT remove_compression_policy('sensor_readings', if_not_exists => TRUE);

-- 3. Decompress any already-compressed chunks so existing row-level deletes work.
--    This may take a few minutes on large datasets.
SELECT decompress_chunk(c.chunk_schema || '.' || c.chunk_name)
FROM timescaledb_information.chunks c
WHERE c.hypertable_name = 'sensor_readings'
  AND c.is_compressed = TRUE;

-- 4. Verify no policies remain on sensor_readings.
SELECT * FROM timescaledb_information.jobs
WHERE hypertable_name = 'sensor_readings';
