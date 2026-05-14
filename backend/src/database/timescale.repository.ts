import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient } from 'pg';
import { ProcessedReading } from '@iotproxy/shared';

const ALLOWED_VIEWS = new Set(['sensor_readings', 'readings_1h', 'readings_1d']);
const ALLOWED_TIME_COLS = new Set(['phenomenon_time', 'bucket']);

export const ALLOWED_AGG = new Set(['AVG', 'MIN', 'MAX', 'SUM', 'LATEST', 'COUNT', 'NONE']);

export interface TimeSeriesQueryParams {
  sensorId: string;
  startTs: Date;
  endTs: Date;
  agg: 'AVG' | 'MIN' | 'MAX' | 'SUM' | 'LATEST' | 'COUNT' | 'NONE';
  intervalMs?: number;
  limit?: number;
  /** Keyset cursor: ISO timestamp — exclusive lower/upper bound depending on sortDir */
  cursor?: Date;
  /** Sort direction for raw queries. Default: DESC (newest first). */
  sortDir?: 'ASC' | 'DESC';
  /** Minimum quality code to include (inclusive). Useful to filter out low-quality readings. */
  minQuality?: number;
  /**
   * JSONB field inside `processed_data` to use as the numeric value when
   * aggregating on the raw table (e.g. "temperature", "value").
   * Required for agg != NONE when the hourly/daily continuous aggregates are
   * not available (recent data or short ranges).
   */
  aggField?: string;
}

@Injectable()
export class TimescaleRepository implements OnModuleInit, OnModuleDestroy {
  private pool!: Pool;
  private readonly logger = new Logger(TimescaleRepository.name);

  constructor(private config: ConfigService) {}

  async onModuleInit() {
    this.pool = new Pool({
      connectionString: this.config.get<string>('database.url'),
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });

    this.pool.on('error', (err) => {
      this.logger.error('Unexpected pg pool error', err);
    });

    this.pool.on('connect', () => {
      this.logger.log('Database connection established');
    });

    this.pool.on('remove', () => {
      this.logger.debug('Database connection removed from pool');
    });

    // Test connection with retry logic
    await this.testConnection();
  }

  private async testConnection(retries = 5, delay = 2000): Promise<void> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await this.pool.query('SELECT 1');
        this.logger.log('Database connection test successful');
        return;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.logger.warn(`Database connection attempt ${attempt}/${retries} failed: ${error.message}`);
        
        if (attempt === retries) {
          this.logger.error('Failed to connect to database after all retries');
          throw new Error(`Database connection failed: ${error.message}`);
        }
        
        // Wait before retry with exponential backoff
        const waitTime = delay * attempt;
        this.logger.log(`Retrying in ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  // ── Writes ──────────────────────────────────────────────────────────────────

  async batchInsert(readings: ProcessedReading[]): Promise<void> {
    if (readings.length === 0) return;

    const values = readings
      .map((_, i) => {
        const b = i * 9;
        return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9})`;
      })
      .join(',');

    const params = readings.flatMap((r) => [
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
         (sensor_id, organization_id, site_id, phenomenon_time,
          raw_data, processed_data, quality_code, pipeline_flags, config_version_id)
       VALUES ${values}
       ON CONFLICT (sensor_id, phenomenon_time) DO NOTHING`,
      params,
    );
  }

  // ── Reads ───────────────────────────────────────────────────────────────────

  async queryTimeSeries(params: TimeSeriesQueryParams & { rawRetentionDays?: number }) {
    const rangeMs = params.endTs.getTime() - params.startTs.getTime();
    const now = Date.now();
    const oneHourAgo = now - 3_600_000;
    const oneDayAgo  = now - 86_400_000;
    const sixHours   = 6 * 3_600_000;
    const sevenDays  = 7 * 86_400_000;

    // If the entire requested range is older than the raw retention cutoff,
    // serve from daily summaries (raw data may have been purged).
    // If the range spans the cutoff and interval is daily-or-higher, union summaries (older) + raw aggregation (recent).
    if (params.rawRetentionDays && params.rawRetentionDays > 0) {
      const cutoffMs = now - params.rawRetentionDays * 86_400_000;
      const startMs = params.startTs.getTime();
      const endMs = params.endTs.getTime();
      if (endMs < cutoffMs) {
        return this.queryDailySummary(
          params.sensorId,
          params.startTs,
          params.endTs,
          params.sortDir ?? 'ASC',
          params.limit,
        );
      }
      // Union if the window straddles the cutoff and the bucket is >= 1 day
      const intervalMs = params.intervalMs ?? 3_600_000;
      if (startMs < cutoffMs && endMs >= cutoffMs && intervalMs >= 86_400_000 && params.agg !== 'NONE') {
        const older = await this.queryDailySummary(
          params.sensorId,
          params.startTs,
          new Date(cutoffMs - 1),
          'ASC',
          params.limit,
        );
        const recent = await this.aggregateRaw({ ...params, startTs: new Date(cutoffMs), sortDir: 'ASC' });
        const merged = [...older, ...recent].sort((a: any, b: any) => new Date(a.bucket).getTime() - new Date(b.bucket).getTime());
        return (params.sortDir ?? 'ASC') === 'ASC' ? merged : merged.reverse();
      }
    }

    if (params.agg === 'NONE') {
      return this.queryRaw(params);
    }

    // Routing strategy:
    //
    // readings_1h / readings_1d are TimescaleDB continuous aggregates. They are
    // unreliable for "current" data for two reasons:
    //   1. refresh policy uses a sliding 3-hour window — gaps >3h are never
    //      backfilled automatically.
    //   2. the view historically filtered quality_code IN ('GOOD','UNCERTAIN'),
    //      so any MAINTENANCE/BAD readings are invisible in the view even though
    //      the raw data is present.
    //
    // For ranges up to 30 days we always use aggregateRaw (queries sensor_readings
    // directly, respects aggField, includes all quality codes, accurate). Raw data
    // is retained per-sensor for at least rawRetentionDays (default 7 days in this
    // system) so this is safe for the common chart ranges.
    //
    // For ranges > 30 days we fall back to the continuous aggregate views and,
    // if they return nothing, fall back once more to the application-level daily
    // summaries so historical data is always available after raw deletion.
    const thirtyDays = 30 * 86_400_000;

    // Special handling: 'LATEST' needs raw or summary; views don't include latest_val
    if (params.agg === 'LATEST' && rangeMs > thirtyDays) {
      return this.queryDailySummary(
        params.sensorId,
        params.startTs,
        params.endTs,
        params.sortDir ?? 'ASC',
        params.limit,
      );
    }

    if (rangeMs <= thirtyDays) {
      return this.aggregateRaw(params);
    }

    // > 30 days: try continuous aggregate views (may be stale or filtered),
    // fall back to daily summaries if the view returns nothing.
    const viewRows = rangeMs >= sevenDays && params.endTs.getTime() <= oneDayAgo
      ? await this.queryAggregate('readings_1d', 'bucket', params)
      : await this.queryAggregate('readings_1h', 'bucket', params);

    if (viewRows.length > 0) {
      return viewRows;
    }

    // View was empty — try daily summaries as last resort
    if (params.sensorId) {
      const summaryRows = await this.queryDailySummary(
        params.sensorId,
        params.startTs,
        params.endTs,
        params.sortDir ?? 'ASC',
        params.limit,
      );
      if (summaryRows.length > 0) return summaryRows;
    }

    // Fall back to raw aggregation for the full range
    return this.aggregateRaw(params);
  }

  async getLatestPerSensor(
    sensorIds: string[],
  ): Promise<Record<string, unknown>> {
    if (sensorIds.length === 0) return {};

    const result = await this.pool.query(
      `SELECT DISTINCT ON (sensor_id)
         sensor_id, phenomenon_time, processed_data, quality_code
       FROM sensor_readings
       WHERE sensor_id = ANY($1)
       ORDER BY sensor_id, phenomenon_time DESC`,
      [sensorIds],
    );

    return Object.fromEntries(result.rows.map((r) => [r.sensor_id, r]));
  }

  async getHealthStatus(): Promise<{ ok: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      await this.pool.query('SELECT 1');
      return { ok: true, latencyMs: Date.now() - start };
    } catch {
      return { ok: false, latencyMs: Date.now() - start };
    }
  }

  // ── Discovery payloads ───────────────────────────────────────────────────────

  async recordDiscoveryPayload(siteId: string, payload: unknown): Promise<void> {
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Remove oldest entries beyond the 500-item cap
      await client.query(
        `DELETE FROM discovery_payloads
         WHERE id IN (
           SELECT id FROM discovery_payloads
           WHERE site_id = $1
           ORDER BY received_at DESC
           OFFSET 499
         )`,
        [siteId],
      );
      await client.query(
        `INSERT INTO discovery_payloads (site_id, payload) VALUES ($1, $2)`,
        [siteId, JSON.stringify(payload)],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getDiscoveryPayloads(siteId: string): Promise<unknown[]> {
    const result = await this.pool.query(
      `SELECT payload FROM discovery_payloads
       WHERE site_id = $1
       ORDER BY received_at ASC`,
      [siteId],
    );
    return result.rows.map((r) => r.payload);
  }

  async deleteDiscoveryPayloads(siteId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM discovery_payloads WHERE site_id = $1`,
      [siteId],
    );
  }

  // ── Retention ────────────────────────────────────────────────────────────────

  async enforceRecordLimit(sensorId: string, limit: number): Promise<void> {
    // Keep only the `limit` newest records — delete everything older than the Nth entry
    await this.pool.query(
      `DELETE FROM sensor_readings
       WHERE sensor_id = $1
         AND phenomenon_time < (
           SELECT phenomenon_time FROM sensor_readings
           WHERE sensor_id = $1
           ORDER BY phenomenon_time DESC
           LIMIT 1 OFFSET $2
         )`,
      [sensorId, limit],
    );
  }

  async deleteOlderThan(organizationId: string, days: number): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM sensor_readings
       WHERE organization_id = $1
         AND phenomenon_time < NOW() - make_interval(days => $2)`,
      [organizationId, days],
    );
    return result.rowCount ?? 0;
  }

  async deleteReading(sensorId: string, phenomenonTime: Date, organizationId: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM sensor_readings
       WHERE sensor_id = $1
         AND phenomenon_time = $2
         AND organization_id = $3`,
      [sensorId, phenomenonTime, organizationId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async clearAllReadings(sensorId: string, organizationId: string): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM sensor_readings
       WHERE sensor_id = $1
         AND organization_id = $2`,
      [sensorId, organizationId],
    );
    return result.rowCount ?? 0;
  }

  // ── Daily summary rollup ─────────────────────────────────────────────────────

  /**
   * Materialise daily summaries for a sensor for all dates that have raw
   * readings but no existing summary row yet.
   *
   * @param aggField – JSONB key inside processed_data holding the numeric value
   * @param cutoffDate – only roll up days strictly before this date (today is excluded)
   */
  async rollupDailySummary(
    sensorId: string,
    organizationId: string,
    aggField: string,
    cutoffDate: Date,
  ): Promise<number> {
    // Resolve the numeric value for each reading.
    // Try the configured aggField first, then fall back through common field names,
    // then take the first numeric value found anywhere in processed_data.
    // This matches the same logic used by the readings_1h continuous aggregate so
    // manual summaries are consistent with what the chart layer serves.
    // Every fallback is guarded by a regex CASE WHEN so a non-numeric string
    // (e.g. "N/A") never reaches the ::double precision cast and throws.
    const result = await this.pool.query(
      `INSERT INTO readings_daily_summary
         (sensor_id, organization_id, day, avg_val, min_val, max_val, latest_val, sum_val, sample_count, agg_field)
       SELECT
         $1::uuid,
         $2::uuid,
         date_trunc('day', phenomenon_time)::date AS day,
         AVG(numeric_val)   AS avg_val,
         MIN(numeric_val)   AS min_val,
         MAX(numeric_val)   AS max_val,
         (array_agg(numeric_val ORDER BY phenomenon_time DESC))[1] AS latest_val,
         SUM(numeric_val)   AS sum_val,
         COUNT(*)::int      AS sample_count,
         $3                 AS agg_field
       FROM (
         SELECT phenomenon_time,
                COALESCE(
                  CASE WHEN (processed_data->>$3) ~ '^-?[0-9]+(\\.[0-9]+)?([eE][+-]?[0-9]+)?$'
                    THEN (processed_data->>$3)::double precision END,
                  CASE WHEN (processed_data->>'value') ~ '^-?[0-9]+(\\.[0-9]+)?([eE][+-]?[0-9]+)?$'
                    THEN (processed_data->>'value')::double precision END,
                  CASE WHEN (processed_data->>'temperature') ~ '^-?[0-9]+(\\.[0-9]+)?([eE][+-]?[0-9]+)?$'
                    THEN (processed_data->>'temperature')::double precision END,
                  CASE WHEN (processed_data->>'humidity') ~ '^-?[0-9]+(\\.[0-9]+)?([eE][+-]?[0-9]+)?$'
                    THEN (processed_data->>'humidity')::double precision END,
                  CASE WHEN (processed_data->>'pressure') ~ '^-?[0-9]+(\\.[0-9]+)?([eE][+-]?[0-9]+)?$'
                    THEN (processed_data->>'pressure')::double precision END,
                  CASE WHEN (processed_data->>'voltage') ~ '^-?[0-9]+(\\.[0-9]+)?([eE][+-]?[0-9]+)?$'
                    THEN (processed_data->>'voltage')::double precision END,
                  CASE WHEN (processed_data->>'current') ~ '^-?[0-9]+(\\.[0-9]+)?([eE][+-]?[0-9]+)?$'
                    THEN (processed_data->>'current')::double precision END,
                  CASE WHEN (processed_data->>'power') ~ '^-?[0-9]+(\\.[0-9]+)?([eE][+-]?[0-9]+)?$'
                    THEN (processed_data->>'power')::double precision END,
                  (SELECT val::double precision
                   FROM jsonb_each_text(processed_data) AS j(key, val)
                   WHERE val ~ '^-?[0-9]+(\\.[0-9]+)?([eE][+-]?[0-9]+)?$'
                   LIMIT 1)
                ) AS numeric_val
         FROM sensor_readings
         WHERE sensor_id = $1
           AND organization_id = $2
           AND phenomenon_time < $4
       ) sub
       WHERE numeric_val IS NOT NULL
       GROUP BY date_trunc('day', phenomenon_time)::date
       ON CONFLICT (sensor_id, day) DO UPDATE SET
         avg_val      = EXCLUDED.avg_val,
         min_val      = EXCLUDED.min_val,
         max_val      = EXCLUDED.max_val,
         latest_val   = EXCLUDED.latest_val,
         sum_val      = EXCLUDED.sum_val,
         sample_count = EXCLUDED.sample_count,
         agg_field    = EXCLUDED.agg_field,
         created_at   = NOW()`,
      [sensorId, organizationId, aggField, cutoffDate],
    );
    return result.rowCount ?? 0;
  }

  /**
   * Query daily summaries for a sensor in a date range.
   */
  async queryDailySummary(
    sensorId: string,
    startDate: Date,
    endDate: Date,
    sortDir: 'ASC' | 'DESC' = 'ASC',
    limit = 1000,
  ) {
    const result = await this.pool.query(
      `SELECT day AS bucket, avg_val, min_val, max_val, latest_val, sum_val, sample_count
       FROM readings_daily_summary
       WHERE sensor_id = $1
         AND day >= $2
         AND day <= $3
       ORDER BY day ${sortDir === 'DESC' ? 'DESC' : 'ASC'}
       LIMIT $4`,
      [sensorId, startDate, endDate, Math.min(limit, 10_000)],
    );
    return result.rows;
  }

  /**
   * Purge daily summaries older than a given number of months for an org.
   * @deprecated Use purgeSummariesPerSensor instead to respect per-sensor retention settings.
   */
  async purgeSummariesOlderThan(organizationId: string, months: number): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM readings_daily_summary
       WHERE organization_id = $1
         AND day < (CURRENT_DATE - make_interval(months => $2))`,
      [organizationId, months],
    );
    return result.rowCount ?? 0;
  }

  /**
   * Get all sensors that have summaries older than their retention cutoff.
   * Respects the hierarchy: sensor.summaryRetentionMonths → site.defaultSummaryRetentionMonths → org.defaultSummaryRetentionMonths
   */
  async getSensorsNeedingSummaryPurge(
    organizationId: string,
    defaultSummaryRetentionMonths: number,
  ): Promise<Array<{ sensorId: string; cutoffDate: Date }>> {
    const result = await this.pool.query(
      `SELECT DISTINCT s.id AS sensor_id,
              (CURRENT_DATE - make_interval(months => COALESCE(NULLIF(s.summary_retention_months, 0), NULLIF(si.default_summary_retention_months, 0), NULLIF($2, 0)))) AS cutoff_date
       FROM sensors s
       JOIN sites si ON si.id = s.site_id
       JOIN readings_daily_summary ds ON ds.sensor_id = s.id
       WHERE s.organization_id = $1
         AND s.deleted_at IS NULL
         AND COALESCE(NULLIF(s.summary_retention_months, 0), NULLIF(si.default_summary_retention_months, 0), NULLIF($2, 0)) IS NOT NULL
         AND ds.day < (CURRENT_DATE - make_interval(months => COALESCE(NULLIF(s.summary_retention_months, 0), NULLIF(si.default_summary_retention_months, 0), NULLIF($2, 0))))
       LIMIT 10000`,
      [organizationId, defaultSummaryRetentionMonths],
    );
    return result.rows.map((r: any) => ({
      sensorId: r.sensor_id,
      cutoffDate: new Date(r.cutoff_date),
    }));
  }

  /**
   * Delete daily summaries older than the per-sensor retention cutoff.
   */
  async deleteSummariesOlderThanPerSensor(sensorId: string, cutoffDate: Date): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM readings_daily_summary
       WHERE sensor_id = $1
         AND day < $2`,
      [sensorId, cutoffDate],
    );
    return result.rowCount ?? 0;
  }

  /**
   * Get all sensor IDs that have raw readings older than their retention cutoff
   * (i.e. readings that need to be rolled up before deletion).
   */
  async getSensorsNeedingRollup(
    organizationId: string,
    defaultRawRetentionDays: number,
    defaultSummaryAggMode = 'AVG',
  ): Promise<Array<{ sensorId: string; aggField: string; aggMode: string; cutoffDate: Date }>> {
    const result = await this.pool.query(
      `SELECT DISTINCT s.id AS sensor_id,
              COALESCE(s.agg_field, 'value') AS agg_field,
              COALESCE(s.summary_agg_mode, si.default_summary_agg_mode, $3, 'AVG') AS agg_mode,
              (CURRENT_DATE - make_interval(days => COALESCE(NULLIF(s.raw_retention_days, 0), NULLIF(si.default_raw_retention_days, 0), NULLIF($2, 0)))) AS cutoff_date
       FROM sensors s
       JOIN sites si ON si.id = s.site_id
       JOIN sensor_readings sr ON sr.sensor_id = s.id
       WHERE s.organization_id = $1
         AND s.deleted_at IS NULL
         AND COALESCE(NULLIF(s.raw_retention_days, 0), NULLIF(si.default_raw_retention_days, 0), NULLIF($2, 0)) IS NOT NULL
         AND sr.phenomenon_time < (CURRENT_DATE - make_interval(days => COALESCE(NULLIF(s.raw_retention_days, 0), NULLIF(si.default_raw_retention_days, 0), NULLIF($2, 0))))
       LIMIT 10000`,
      [organizationId, defaultRawRetentionDays, defaultSummaryAggMode],
    );
    return result.rows.map((r: any) => ({
      sensorId: r.sensor_id,
      aggField: r.agg_field,
      aggMode: r.agg_mode,
      cutoffDate: new Date(r.cutoff_date),
    }));
  }

  /**
   * Decompress any TimescaleDB chunks for sensor_readings that are older than
   * the given date.  Backfilled historical data lands in time ranges that may
   * already be compressed; DELETE cannot remove rows from compressed chunks.
   *
   * Safe to call even when TimescaleDB compression is not configured — errors
   * (function not found, no chunks, etc.) are swallowed as no-ops.
   */
  async decompressChunksOlderThan(cutoffDate: Date): Promise<void> {
    try {
      await this.pool.query(
        `SELECT decompress_chunk(c, true)
         FROM show_chunks('sensor_readings', older_than => $1) c`,
        [cutoffDate],
      );
    } catch {
      // No-op: TimescaleDB not present, compression not enabled, or no chunks in range.
    }
  }

  /**
   * Delete raw readings older than the per-sensor retention cutoff.
   * Only deletes rows whose day already has a summary — call rollupDailySummary
   * first to guarantee the JIT summary exists before deletion.
   */
  async deleteRawOlderThanPerSensor(sensorId: string, cutoffDate: Date): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM sensor_readings r
       WHERE r.sensor_id = $1
         AND r.phenomenon_time < $2
         AND EXISTS (
           SELECT 1
           FROM readings_daily_summary ds
           WHERE ds.sensor_id = r.sensor_id
             AND ds.day = date_trunc('day', r.phenomenon_time)::date
         )`,
      [sensorId, cutoffDate],
    );
    return result.rowCount ?? 0;
  }

  /**
   * Count how many readings will be deleted for a sensor (retention preview).
   * Does NOT require pre-existing summary rows — the actual run does a JIT rollup
   * before deleting, so the preview should reflect the full set of raw readings
   * that are candidates for deletion, not just those already summarised.
   */
  async countReadingsOlderThan(sensorId: string, cutoffDate: Date): Promise<number> {
    const result = await this.pool.query(
      `SELECT COUNT(*) as count
       FROM sensor_readings r
       WHERE r.sensor_id = $1
         AND r.phenomenon_time < $2`,
      [sensorId, cutoffDate],
    );
    return parseInt(result.rows[0]?.count ?? '0', 10);
  }

  // ── Advanced search ─────────────────────────────────────────────────────────

  /**
   * Multi-sensor search with exact time, range, filtering, sorting, and
   * response metadata (actual data boundaries).
   */
  async advancedSearch(params: {
    organizationId: string;
    sensorIds?: string[];
    siteId?: string;
    startTs?: Date;
    endTs?: Date;
    /** Snap results to exact clock time, e.g. "11:00" every day in range */
    exactTime?: string;
    agg?: 'AVG' | 'MIN' | 'MAX' | 'SUM' | 'COUNT' | 'NONE';
    intervalMs?: number;
    aggField?: string;
    sortBy?: 'time' | 'value' | 'sensor' | 'quality';
    sortDir?: 'ASC' | 'DESC';
    minQuality?: number;
    limit?: number;
    offset?: number;
    fields?: string[];
    /** If false, never fall back to readings_daily_summary (raw-only mode). Default: true */
    includeSummaries?: boolean;
  }) {
    const dir = params.sortDir ?? 'DESC';
    const lim = Math.min(params.limit ?? 500, 10_000);
    const off = params.offset ?? 0;
    const agg = params.agg ?? 'NONE';
    const includeSummaries = params.includeSummaries !== false;

    const args: unknown[] = [params.organizationId];
    const conditions: string[] = ['sr.organization_id::uuid = $1::uuid'];

    // ── Sensor / site filter ───────────────────────────────────────────
    if (params.sensorIds && params.sensorIds.length > 0) {
      args.push(params.sensorIds);
      conditions.push(`sr.sensor_id::uuid = ANY($${args.length}::uuid[])`);
    }
    if (params.siteId) {
      args.push(params.siteId);
      conditions.push(`sr.site_id::uuid = $${args.length}::uuid`);
    }

    // ── Time range ─────────────────────────────────────────────────────
    if (params.startTs) {
      args.push(params.startTs);
      conditions.push(`sr.phenomenon_time >= $${args.length}`);
    }
    if (params.endTs) {
      args.push(params.endTs);
      conditions.push(`sr.phenomenon_time <= $${args.length}`);
    }

    // ── Exact clock time filter (e.g. "11:00") ────────────────────────
    if (params.exactTime) {
      const [hh, mm] = params.exactTime.split(':').map(Number);
      if (!isNaN(hh)) {
        args.push(hh);
        conditions.push(`EXTRACT(HOUR FROM sr.phenomenon_time) = $${args.length}`);
        if (!isNaN(mm)) {
          args.push(mm);
          conditions.push(`EXTRACT(MINUTE FROM sr.phenomenon_time) = $${args.length}`);
        }
      }
    }

    // ── Quality filter ─────────────────────────────────────────────────
    if (params.minQuality !== undefined) {
      args.push(params.minQuality);
      conditions.push(`sr.quality_code >= $${args.length}`);
    }

    const whereClause = conditions.join(' AND ');

    // ── Determine sort expression ──────────────────────────────────────
    let orderExpr: string;
    switch (params.sortBy) {
      case 'value':
        orderExpr = params.aggField
          ? `(sr.processed_data->>'${params.aggField.replace(/'/g, "''")}')::double precision ${dir} NULLS LAST`
          : `sr.phenomenon_time ${dir}`;
        break;
      case 'sensor':
        orderExpr = `sr.sensor_id ${dir}, sr.phenomenon_time DESC`;
        break;
      case 'quality':
        orderExpr = `sr.quality_code ${dir}, sr.phenomenon_time DESC`;
        break;
      default:
        orderExpr = `sr.phenomenon_time ${dir}`;
    }

    // ── Raw (non-aggregated) path ──────────────────────────────────────
    if (agg === 'NONE') {
      // Select specific fields from processed_data if requested
      const fieldsExpr = (params.fields && params.fields.length > 0)
        ? `jsonb_strip_nulls(jsonb_build_object(${params.fields
            .map((f) => `'${f.replace(/'/g, "''")}', sr.processed_data->'${f.replace(/'/g, "''")}'`)
            .join(', ') }))`
        : 'sr.processed_data';

      // If summaries are allowed and this is a time-sorted listing (the common case),
      // build a UNION ALL over raw + daily summaries and apply ORDER/LIMIT/OFFSET post-union
      const unionEnabled = includeSummaries && !params.exactTime && (params.sortBy === undefined || params.sortBy === 'time') && ((params.sensorIds && params.sensorIds.length > 0) || !!params.siteId);

      if (unionEnabled) {
        const uargs: unknown[] = [];

        // Common filters
        uargs.push(params.organizationId); // $1
        const orgP = '$1';

        let sensorP = '';
        if (params.sensorIds && params.sensorIds.length > 0) {
          uargs.push(params.sensorIds); // $2
          sensorP = `$${uargs.length}`;
        }

        let siteP = '';
        if (params.siteId) {
          uargs.push(params.siteId); // next
          siteP = `$${uargs.length}`;
        }

        let startP = '';
        if (params.startTs) {
          uargs.push(params.startTs);
          startP = `$${uargs.length}`;
        }

        let endP = '';
        if (params.endTs) {
          uargs.push(params.endTs);
          endP = `$${uargs.length}`;
        }

        let minQ = '';
        if (params.minQuality !== undefined) {
          uargs.push(params.minQuality);
          minQ = `$${uargs.length}`;
        }

        // Raw leg WHERE
        const rawConds: string[] = [`sr.organization_id::uuid = ${orgP}::uuid`];
        if (sensorP) rawConds.push(`sr.sensor_id::uuid = ANY(${sensorP}::uuid[])`);
        if (siteP) rawConds.push(`sr.site_id::uuid = ${siteP}::uuid`);
        if (startP) rawConds.push(`sr.phenomenon_time >= ${startP}`);
        if (endP) rawConds.push(`sr.phenomenon_time <= ${endP}`);
        if (minQ) rawConds.push(`sr.quality_code >= ${minQ}`);

        const rawSQL = `
          SELECT sr.sensor_id AS sensor_id,
                 sr.phenomenon_time AS phenomenon_time,
                 ${fieldsExpr} AS processed_data,
                 sr.quality_code::text AS quality_code,
                 sr.pipeline_flags AS pipeline_flags,
                 NULL::double precision AS summary_value,
                 NULL::text AS summary_mode
          FROM sensor_readings sr
          WHERE ${rawConds.join(' AND ')}
        `;

        // Summary leg WHERE
        const hasSiteJoin = true;
        const sumConds: string[] = [`ds.organization_id::uuid = ${orgP}::uuid`];
        if (sensorP) sumConds.push(`ds.sensor_id::uuid = ANY(${sensorP}::uuid[])`);
        if (siteP) sumConds.push(`s.site_id::uuid = ${siteP}::uuid`);
        if (startP) sumConds.push(`ds.day >= ${startP}::date`);
        if (endP) sumConds.push(`ds.day <= ${endP}::date`);

        const sumSQL = `
          SELECT ds.sensor_id AS sensor_id,
                 (ds.day::timestamp) AS phenomenon_time,
                 jsonb_build_object('avg', ds.avg_val, 'min', ds.min_val, 'max', ds.max_val, 'latest', ds.latest_val, 'sum', ds.sum_val) AS processed_data,
                 'SUMMARIZED'::text AS quality_code,
                 ARRAY['daily_summary']::text[] AS pipeline_flags,
                 CASE COALESCE(s.summary_agg_mode, 'AVG')
                   WHEN 'MAX'    THEN ds.max_val
                   WHEN 'MIN'    THEN ds.min_val
                   WHEN 'LATEST' THEN ds.latest_val
                   WHEN 'SUM'    THEN ds.sum_val
                   ELSE ds.avg_val
                 END AS summary_value,
                 COALESCE(s.summary_agg_mode, 'AVG') AS summary_mode
          FROM readings_daily_summary ds
          JOIN sensors s ON s.id = ds.sensor_id
          WHERE ${sumConds.join(' AND ')}
            AND NOT EXISTS (
              SELECT 1 FROM sensor_readings sr2
              WHERE sr2.organization_id::uuid = ${orgP}::uuid
                ${sensorP ? `AND sr2.sensor_id::uuid = ANY(${sensorP}::uuid[])` : ''}
                ${siteP ? `AND sr2.site_id::uuid = ${siteP}::uuid` : ''}
                AND sr2.phenomenon_time >= ds.day::timestamp
                AND sr2.phenomenon_time < (ds.day::timestamp + interval '1 day')
                ${minQ ? `AND sr2.quality_code >= ${minQ}` : ''}
            )
        `;

        // Count total across union
        const countRes = await this.pool.query(
          `SELECT COUNT(*)::int AS total FROM ( ${rawSQL} UNION ALL ${sumSQL} ) u`,
          uargs,
        );
        const total: number = countRes.rows[0]?.total ?? 0;

        // Page after union
        uargs.push(lim, off);
        const dataRes = await this.pool.query(
          `SELECT *
           FROM ( ${rawSQL} UNION ALL ${sumSQL} ) u
           ORDER BY u.phenomenon_time ${dir}, u.sensor_id
           LIMIT $${uargs.length - 1} OFFSET $${uargs.length}`,
          uargs,
        );

        const rows = dataRes.rows;
        const dataStart = rows.length > 0
          ? rows.reduce((a: any, b: any) => new Date(a.phenomenon_time) < new Date(b.phenomenon_time) ? a : b).phenomenon_time
          : null;
        const dataEnd = rows.length > 0
          ? rows.reduce((a: any, b: any) => new Date(a.phenomenon_time) > new Date(b.phenomenon_time) ? a : b).phenomenon_time
          : null;
        const hasSummary = rows.some((r: any) => r.quality_code === 'SUMMARIZED');

        return {
          data: rows,
          meta: {
            total,
            limit: lim,
            offset: off,
            returned: rows.length,
            dataStart,
            dataEnd,
            fromDailySummary: hasSummary,
          },
        };
      }

      // Fallback: raw-only (keeps previous behavior including summary fallback when empty or spanning retention)
      const countResult = await this.pool.query(
        `SELECT COUNT(*)::int AS total FROM sensor_readings sr WHERE ${whereClause}`,
        args,
      );
      const total = countResult.rows[0]?.total ?? 0;

      // Fetch page
      args.push(lim, off);
      const result = await this.pool.query(
        `SELECT sr.sensor_id, sr.phenomenon_time, ${fieldsExpr} AS processed_data,
                sr.quality_code, sr.pipeline_flags
         FROM sensor_readings sr
         WHERE ${whereClause}
         ORDER BY ${orderExpr}
         LIMIT $${args.length - 1} OFFSET $${args.length}`,
        args,
      );

      const dataStart = result.rows.length > 0
        ? result.rows.reduce((a: any, b: any) =>
            new Date(a.phenomenon_time) < new Date(b.phenomenon_time) ? a : b
          ).phenomenon_time
        : null;
      const dataEnd = result.rows.length > 0
        ? result.rows.reduce((a: any, b: any) =>
            new Date(a.phenomenon_time) > new Date(b.phenomenon_time) ? a : b
          ).phenomenon_time
        : null;

      const shouldCheckSummaries = params.sensorIds && params.sensorIds.length > 0 && !params.exactTime;
      const querySpansRetention = params.startTs && (Date.now() - params.startTs.getTime()) > 7 * 86_400_000;

      if (includeSummaries && shouldCheckSummaries && (total === 0 || querySpansRetention)) {
        const summary = await this.searchFromDailySummary(params, dir, lim, off, 'raw');
        if (summary) {
          if (total === 0 || querySpansRetention) {
            return summary;
          }
        }
      }

      return {
        data: result.rows,
        meta: {
          total,
          limit: lim,
          offset: off,
          returned: result.rows.length,
          dataStart,
          dataEnd,
        },
      };
    }

    // ── Aggregated path ────────────────────────────────────────────────
    const intervalSec = Math.floor((params.intervalMs ?? 3_600_000) / 1000);
    const aggFieldSafe = params.aggField ?? 'value';

    args.push(`${intervalSec} seconds`);
    const intervalParam = `$${args.length}`;
    args.push(aggFieldSafe);
    const fieldParam = `$${args.length}`;

    const numericFilter = `AND (sr.processed_data->>${fieldParam}) ~ '^-?[0-9]+(\\.[0-9]+)?$'`;

    // Count distinct buckets
    const countResult = await this.pool.query(
      `SELECT COUNT(DISTINCT time_bucket(${intervalParam}::interval, sr.phenomenon_time))::int AS total
       FROM sensor_readings sr
       WHERE ${whereClause} ${numericFilter}`,
      args,
    );
    const total = countResult.rows[0]?.total ?? 0;

    args.push(lim, off);
    const result = await this.pool.query(
      `SELECT time_bucket(${intervalParam}::interval, sr.phenomenon_time) AS bucket,
              sr.sensor_id,
              AVG((sr.processed_data->>${fieldParam})::double precision)  AS avg_val,
              MIN((sr.processed_data->>${fieldParam})::double precision)  AS min_val,
              MAX((sr.processed_data->>${fieldParam})::double precision)  AS max_val,
              SUM((sr.processed_data->>${fieldParam})::double precision)  AS sum_val,
              COUNT(*)::int AS sample_count
       FROM sensor_readings sr
       WHERE ${whereClause} ${numericFilter}
       GROUP BY 1, sr.sensor_id
       ORDER BY 1 ${dir}, sr.sensor_id
       LIMIT $${args.length - 1} OFFSET $${args.length}`,
      args,
    );

    // If raw table returned nothing and we have specific sensor IDs, fall back
    // to readings_daily_summary (data archived by the retention process).
    // Also check if the query start date is older than typical retention (7 days).
    const shouldCheckSummaries = params.sensorIds && params.sensorIds.length > 0 && !params.exactTime;
    const querySpansRetention = params.startTs && (Date.now() - params.startTs.getTime()) > 7 * 86_400_000;

    if (includeSummaries && shouldCheckSummaries && (total === 0 || querySpansRetention)) {
      const summary = await this.searchFromDailySummary(params, dir, lim, off, 'agg');
      if (summary) {
        if (total === 0 || querySpansRetention) {
          return summary;
        }
      }
    }

    const dataStart = result.rows.length > 0 ? result.rows[0].bucket : null;
    const dataEnd = result.rows.length > 0 ? result.rows[result.rows.length - 1].bucket : null;

    return {
      data: result.rows,
      meta: {
        total,
        limit: lim,
        offset: off,
        returned: result.rows.length,
        dataStart: dir === 'ASC' ? dataStart : dataEnd,
        dataEnd: dir === 'ASC' ? dataEnd : dataStart,
      },
    };
  }

  private async searchFromDailySummary(
    params: {
      organizationId: string;
      sensorIds?: string[];
      startTs?: Date;
      endTs?: Date;
    },
    dir: string,
    lim: number,
    off: number,
    mode: 'raw' | 'agg',
  ) {
    // Cast $1 to uuid[] so pg's text[] is accepted; $2 uses implicit text→uuid cast
    const args: unknown[] = [params.sensorIds, params.organizationId];
    const conditions = ['sensor_id = ANY($1::uuid[])', 'organization_id = $2::uuid'];

    if (params.startTs) {
      args.push(params.startTs);
      conditions.push(`day >= $${args.length}::date`);
    }
    if (params.endTs) {
      args.push(params.endTs);
      conditions.push(`day <= $${args.length}::date`);
    }

    const whereClause = conditions.join(' AND ');

    const countRes = await this.pool.query(
      `SELECT COUNT(*)::int AS total
       FROM readings_daily_summary ds
       JOIN sensors s ON s.id = ds.sensor_id
       WHERE ${whereClause.replace(/\bsensor_id\b/g, 'ds.sensor_id').replace(/\borganization_id\b/g, 'ds.organization_id')}`,
      args,
    );
    const total: number = countRes.rows[0]?.total ?? 0;
    if (total === 0) return null;

    args.push(lim, off);
    const rows = (await this.pool.query(
      `SELECT ds.sensor_id AS sensor_id,
              ds.day        AS day,
              ds.avg_val    AS avg_val,
              ds.min_val    AS min_val,
              ds.max_val    AS max_val,
              ds.latest_val AS latest_val,
              ds.sum_val    AS sum_val,
              ds.sample_count AS sample_count,
              COALESCE(s.summary_agg_mode, 'AVG') AS summary_mode,
              CASE COALESCE(s.summary_agg_mode, 'AVG')
                WHEN 'MAX'    THEN ds.max_val
                WHEN 'MIN'    THEN ds.min_val
                WHEN 'LATEST' THEN ds.latest_val
                WHEN 'SUM'    THEN ds.sum_val
                ELSE ds.avg_val
              END AS summary_value
       FROM readings_daily_summary ds
       JOIN sensors s ON s.id = ds.sensor_id
       WHERE ${whereClause.replace(/\bsensor_id\b/g, 'ds.sensor_id').replace(/\borganization_id\b/g, 'ds.organization_id')}
       ORDER BY ds.day ${dir}, ds.sensor_id
       LIMIT $${args.length - 1} OFFSET $${args.length}`,
      args,
    )).rows;

    let data: Record<string, unknown>[];
    if (mode === 'raw') {
      data = rows.map((r: any) => ({
        sensor_id: r.sensor_id,
        phenomenon_time: new Date(r.day).toISOString(),
        processed_data: { avg: r.avg_val, min: r.min_val, max: r.max_val, latest: r.latest_val, sum: r.sum_val },
        quality_code: 'SUMMARIZED',
        pipeline_flags: ['daily_summary'],
        summary_value: r.summary_value,
        summary_mode: r.summary_mode,
      }));
    } else {
      data = rows.map((r: any) => ({
        bucket: new Date(r.day).toISOString(),
        sensor_id: r.sensor_id,
        avg_val: r.avg_val,
        min_val: r.min_val,
        max_val: r.max_val,
        latest_val: r.latest_val,
        sum_val: r.sum_val,
        sample_count: r.sample_count,
        summary_value: r.summary_value,
        summary_mode: r.summary_mode,
      }));
    }

    const times = rows.map((r) => new Date(r.day).getTime());
    const dataStart = new Date(Math.min(...times)).toISOString();
    const dataEnd = new Date(Math.max(...times)).toISOString();

    return {
      data,
      meta: {
        total,
        limit: lim,
        offset: off,
        returned: data.length,
        dataStart: dir === 'ASC' ? dataStart : dataEnd,
        dataEnd: dir === 'ASC' ? dataEnd : dataStart,
        fromDailySummary: true,
      },
    };
  }

  /**
   * Find the reading(s) nearest to a specific timestamp for one or more sensors.
   * Returns at most `maxPerSensor` readings per sensor (before + after the target).
   */
  async nearestToTime(
    organizationId: string,
    targetTime: Date,
    sensorIds: string[],
    maxPerSensor = 1,
  ) {
    if (sensorIds.length === 0) return [];

    const results: unknown[] = [];
    for (const sensorId of sensorIds) {
      const result = await this.pool.query(
        `(SELECT sensor_id, phenomenon_time, processed_data, quality_code,
                 ABS(EXTRACT(EPOCH FROM (phenomenon_time - $2))) AS distance_sec
          FROM sensor_readings
          WHERE sensor_id = $1 AND organization_id = $3 AND phenomenon_time <= $2
          ORDER BY phenomenon_time DESC LIMIT $4)
         UNION ALL
         (SELECT sensor_id, phenomenon_time, processed_data, quality_code,
                 ABS(EXTRACT(EPOCH FROM (phenomenon_time - $2))) AS distance_sec
          FROM sensor_readings
          WHERE sensor_id = $1 AND organization_id = $3 AND phenomenon_time > $2
          ORDER BY phenomenon_time ASC LIMIT $4)
         ORDER BY distance_sec
         LIMIT $4`,
        [sensorId, targetTime, organizationId, maxPerSensor],
      );
      results.push(...result.rows);
    }

    return results;
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  /**
   * Raw keyset-paginated query.
   *
   * Cursor semantics depend on sort direction:
   *   DESC → cursor acts as upper-exclusive bound (phenomenon_time < cursor)
   *   ASC  → cursor acts as lower-exclusive bound (phenomenon_time > cursor)
   */
  private async queryRaw(params: TimeSeriesQueryParams) {
    const dir = params.sortDir ?? 'DESC';
    const args: unknown[] = [params.sensorId, params.startTs, params.endTs];

    // Optional quality filter
    let qualityClause = '';
    if (params.minQuality !== undefined) {
      args.push(params.minQuality);
      qualityClause = `AND quality_code >= $${args.length}`;
    }

    // Keyset cursor
    let cursorClause = '';
    if (params.cursor) {
      args.push(params.cursor);
      cursorClause = dir === 'DESC'
        ? `AND phenomenon_time < $${args.length}`
        : `AND phenomenon_time > $${args.length}`;
    }

    args.push(Math.min(params.limit ?? 1_000, 10_000));
    const limitPlaceholder = `$${args.length}`;

    const result = await this.pool.query(
      `SELECT phenomenon_time, processed_data, quality_code, pipeline_flags
       FROM sensor_readings
       WHERE sensor_id = $1
         AND phenomenon_time >= $2
         AND phenomenon_time <= $3
         ${qualityClause}
         ${cursorClause}
       ORDER BY phenomenon_time ${dir}
       LIMIT ${limitPlaceholder}`,
      args,
    );

    return result.rows;
  }

  /**
   * SQL-side time-bucket aggregation on the raw `sensor_readings` table.
   * Used for recent data or short ranges where continuous aggregate views
   * are not yet populated.
   *
   * Requires `aggField` to be set so we know which JSONB key holds the
   * numeric value.  Without it we skip numeric aggregates and return
   * per-bucket sample counts only (still useful for event-rate charts).
   */
  private async aggregateRaw(params: TimeSeriesQueryParams) {
    const intervalSec = Math.floor((params.intervalMs ?? 3_600_000) / 1000);
    const dir = params.sortDir ?? 'DESC';

    const args: unknown[] = [
      `${intervalSec} seconds`,
      params.sensorId,
      params.startTs,
      params.endTs,
    ];

    let qualityClause = '';
    if (params.minQuality !== undefined) {
      args.push(params.minQuality);
      qualityClause = `AND quality_code >= $${args.length}`;
    }

    args.push(Math.min(params.limit ?? 1_000, 10_000));
    const limitPlaceholder = `$${args.length}`;

    // Build a COALESCE expression that:
    //   1. Tries the sensor's configured aggField first
    //   2. Falls back to common field names
    //   3. As last resort, picks the first numeric value found anywhere in the JSONB
    // This ensures charts work even when aggField is misconfigured or the data
    // uses non-standard / non-English field names.
    const numericRegex = `'^-?[0-9]+(\\.[0-9]+)?([eE][+-]?[0-9]+)?$'`;

    args.push(params.aggField ?? 'value');
    const fieldParam = `$${args.length}`;

    const numericVal = `
      COALESCE(
        CASE WHEN (processed_data->>${fieldParam}) ~ ${numericRegex}
             THEN (processed_data->>${fieldParam})::double precision END,
        CASE WHEN (processed_data->>'value') ~ ${numericRegex}
             THEN (processed_data->>'value')::double precision END,
        CASE WHEN (processed_data->>'temperature') ~ ${numericRegex}
             THEN (processed_data->>'temperature')::double precision END,
        CASE WHEN (processed_data->>'humidity') ~ ${numericRegex}
             THEN (processed_data->>'humidity')::double precision END,
        CASE WHEN (processed_data->>'pressure') ~ ${numericRegex}
             THEN (processed_data->>'pressure')::double precision END,
        CASE WHEN (processed_data->>'voltage') ~ ${numericRegex}
             THEN (processed_data->>'voltage')::double precision END,
        CASE WHEN (processed_data->>'current') ~ ${numericRegex}
             THEN (processed_data->>'current')::double precision END,
        CASE WHEN (processed_data->>'power') ~ ${numericRegex}
             THEN (processed_data->>'power')::double precision END,
        (SELECT kv.value::double precision
         FROM jsonb_each_text(processed_data) kv
         WHERE kv.value ~ ${numericRegex}
         LIMIT 1)
      )`;

    const result = await this.pool.query(
      `SELECT time_bucket($1::interval, phenomenon_time) AS bucket,
              AVG(numeric_val) AS avg_val,
              MIN(numeric_val) AS min_val,
              MAX(numeric_val) AS max_val,
              SUM(numeric_val) AS sum_val,
              (array_agg(numeric_val ORDER BY phenomenon_time DESC))[1] AS latest_val,
              COUNT(*)::int    AS sample_count
       FROM (
         SELECT phenomenon_time,
                ${numericVal} AS numeric_val
         FROM sensor_readings
         WHERE sensor_id = $2
           AND phenomenon_time >= $3
           AND phenomenon_time <= $4
           ${qualityClause}
           AND jsonb_typeof(processed_data) = 'object'
       ) sub
       WHERE numeric_val IS NOT NULL
       GROUP BY 1
       ORDER BY 1 ${dir}
       LIMIT ${limitPlaceholder}`,
      args,
    );

    return result.rows;
  }

  /**
   * Query a continuous-aggregate view (readings_1h / readings_1d).
   * Falls back to `aggregateRaw` if the view is not yet populated for the range.
   */
  private async queryAggregate(
    view: string,
    timeCol: string,
    params: TimeSeriesQueryParams,
  ) {
    if (!ALLOWED_VIEWS.has(view) || !ALLOWED_TIME_COLS.has(timeCol)) {
      throw new Error(`Invalid aggregate target: ${view}.${timeCol}`);
    }

    const intervalSec = Math.floor((params.intervalMs ?? 3_600_000) / 1000);
    const dir = params.sortDir ?? 'DESC';

    const args: unknown[] = [
      `${intervalSec} seconds`,
      params.sensorId,
      params.startTs,
      params.endTs,
    ];

    let qualityClause = '';
    if (params.minQuality !== undefined) {
      args.push(params.minQuality);
      qualityClause = `AND quality_code >= $${args.length}`;
    }

    args.push(Math.min(params.limit ?? 1_000, 10_000));
    const limitPlaceholder = `$${args.length}`;

    try {
      const result = await this.pool.query(
        `SELECT time_bucket($1::interval, ${timeCol}) AS bucket,
                AVG(avg_val)        AS avg_val,
                MIN(min_val)        AS min_val,
                MAX(max_val)        AS max_val,
                SUM(avg_val * sample_count) AS sum_val,
                SUM(sample_count)   AS sample_count
         FROM ${view}
         WHERE sensor_id = $2
           AND ${timeCol} >= $3
           AND ${timeCol} <= $4
           ${qualityClause}
         GROUP BY 1
         ORDER BY 1 ${dir}
         LIMIT ${limitPlaceholder}`,
        args,
      );

      return result.rows;
    } catch (err) {
      this.logger.warn(
        `Aggregate query failed for ${view}, falling back to raw aggregation: ${err instanceof Error ? err.message : String(err)}`,
      );
      return this.aggregateRaw(params);
    }
  }
}
