import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient } from 'pg';
import { ProcessedReading } from '@iotproxy/shared';

const ALLOWED_VIEWS = new Set(['sensor_readings', 'readings_1h', 'readings_1d']);
const ALLOWED_TIME_COLS = new Set(['phenomenon_time', 'bucket']);

export const ALLOWED_AGG = new Set(['AVG', 'MIN', 'MAX', 'SUM', 'COUNT', 'NONE']);

export interface TimeSeriesQueryParams {
  sensorId: string;
  startTs: Date;
  endTs: Date;
  agg: 'AVG' | 'MIN' | 'MAX' | 'SUM' | 'COUNT' | 'NONE';
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
    if (params.rawRetentionDays && params.rawRetentionDays > 0) {
      const cutoffMs = now - params.rawRetentionDays * 86_400_000;
      if (params.endTs.getTime() < cutoffMs) {
        return this.queryDailySummary(
          params.sensorId,
          params.startTs,
          params.endTs,
          params.sortDir ?? 'ASC',
          params.limit,
        );
      }
    }

    if (params.agg === 'NONE') {
      return this.queryRaw(params);
    }

    // Continuous aggregate views only contain data older than their end_offset.
    // For anything that touches the last hour — or for short ranges where the
    // overhead of a view scan outweighs a raw table scan — aggregate on raw.
    if (params.endTs.getTime() > oneHourAgo || rangeMs < sixHours) {
      return this.aggregateRaw(params);
    }

    if (rangeMs >= sevenDays) {
      // Spans >7 d but touches the last day → hourly view (daily not yet populated)
      if (params.endTs.getTime() > oneDayAgo) {
        return this.queryAggregate('readings_1h', 'bucket', params);
      }
      return this.queryAggregate('readings_1d', 'bucket', params);
    }

    // 6 h – 7 d, older than 1 h → hourly view
    return this.queryAggregate('readings_1h', 'bucket', params);
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
    const result = await this.pool.query(
      `INSERT INTO readings_daily_summary
         (sensor_id, organization_id, day, avg_val, min_val, max_val, latest_val, sum_val, sample_count, agg_field)
       SELECT
         $1,
         $2,
         date_trunc('day', phenomenon_time)::date AS day,
         AVG((processed_data->>$3)::double precision)   AS avg_val,
         MIN((processed_data->>$3)::double precision)   AS min_val,
         MAX((processed_data->>$3)::double precision)   AS max_val,
         (array_agg((processed_data->>$3)::double precision ORDER BY phenomenon_time DESC))[1] AS latest_val,
         SUM((processed_data->>$3)::double precision)   AS sum_val,
         COUNT(*)::int                                   AS sample_count,
         $3
       FROM sensor_readings
       WHERE sensor_id = $1
         AND organization_id = $2
         AND phenomenon_time < $4
         AND (processed_data->>$3) ~ '^-?[0-9]+(\\.[0-9]+)?$'
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
   * Get all sensor IDs that have raw readings older than their retention cutoff
   * (i.e. readings that need to be rolled up before deletion).
   */
  async getSensorsNeedingRollup(
    organizationId: string,
    defaultRawRetentionDays: number,
  ): Promise<Array<{ sensorId: string; aggField: string; cutoffDate: Date }>> {
    const result = await this.pool.query(
      `SELECT DISTINCT s.id AS sensor_id,
              COALESCE(s.agg_field, 'value') AS agg_field,
              (CURRENT_DATE - make_interval(days => COALESCE(NULLIF(s.raw_retention_days, 0), NULLIF(si.default_raw_retention_days, 0), NULLIF($2, 0)))) AS cutoff_date
       FROM sensors s
       JOIN sites si ON si.id = s.site_id
       JOIN sensor_readings sr ON sr.sensor_id = s.id
       WHERE s.organization_id = $1
         AND s.deleted_at IS NULL
         AND COALESCE(NULLIF(s.raw_retention_days, 0), NULLIF(si.default_raw_retention_days, 0), NULLIF($2, 0)) IS NOT NULL
         AND sr.phenomenon_time < (CURRENT_DATE - make_interval(days => COALESCE(NULLIF(s.raw_retention_days, 0), NULLIF(si.default_raw_retention_days, 0), NULLIF($2, 0))))
       LIMIT 10000`,
      [organizationId, defaultRawRetentionDays],
    );
    return result.rows.map((r: any) => ({
      sensorId: r.sensor_id,
      aggField: r.agg_field,
      cutoffDate: new Date(r.cutoff_date),
    }));
  }

  /**
   * Delete raw readings older than the per-sensor retention cutoff.
   */
  async deleteRawOlderThanPerSensor(sensorId: string, cutoffDate: Date): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM sensor_readings
       WHERE sensor_id = $1
         AND phenomenon_time < $2`,
      [sensorId, cutoffDate],
    );
    return result.rowCount ?? 0;
  }

  /**
   * Count how many readings will be deleted for a sensor (retention preview).
   */
  async countReadingsOlderThan(sensorId: string, cutoffDate: Date): Promise<number> {
    const result = await this.pool.query(
      `SELECT COUNT(*) as count
       FROM sensor_readings
       WHERE sensor_id = $1
         AND phenomenon_time < $2`,
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
  }) {
    const dir = params.sortDir ?? 'DESC';
    const lim = Math.min(params.limit ?? 500, 10_000);
    const off = params.offset ?? 0;
    const agg = params.agg ?? 'NONE';

    const args: unknown[] = [params.organizationId];
    const conditions: string[] = ['sr.organization_id = $1'];

    // ── Sensor / site filter ───────────────────────────────────────────
    if (params.sensorIds && params.sensorIds.length > 0) {
      args.push(params.sensorIds);
      conditions.push(`sr.sensor_id = ANY($${args.length})`);
    }
    if (params.siteId) {
      args.push(params.siteId);
      conditions.push(`sr.site_id = $${args.length}`);
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
      let fieldsSelect = 'sr.processed_data';
      if (params.fields && params.fields.length > 0) {
        const picks = params.fields
          .map((f) => `'${f.replace(/'/g, "''")}'`)
          .join(', ');
        fieldsSelect = `jsonb_strip_nulls(
          jsonb_build_object(${params.fields
            .map((f) => `'${f.replace(/'/g, "''")}', sr.processed_data->'${f.replace(/'/g, "''")}'`)
            .join(', ')})
        ) AS processed_data`;
      }

      // Count total matching rows
      const countResult = await this.pool.query(
        `SELECT COUNT(*)::int AS total FROM sensor_readings sr WHERE ${whereClause}`,
        args,
      );
      const total = countResult.rows[0]?.total ?? 0;

      // Fetch page
      args.push(lim, off);
      const result = await this.pool.query(
        `SELECT sr.sensor_id, sr.phenomenon_time, ${fieldsSelect},
                sr.quality_code, sr.pipeline_flags
         FROM sensor_readings sr
         WHERE ${whereClause}
         ORDER BY ${orderExpr}
         LIMIT $${args.length - 1} OFFSET $${args.length}`,
        args,
      );

      // Data boundaries
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

    let selectAgg: string;
    let whereAgg = '';

    if (params.aggField) {
      // Parameterise the field name via jsonb operator to avoid injection
      args.push(params.aggField);
      const fieldParam = `$${args.length}`;
      selectAgg = `
        AVG((processed_data->>${fieldParam})::double precision)  AS avg_val,
        MIN((processed_data->>${fieldParam})::double precision)  AS min_val,
        MAX((processed_data->>${fieldParam})::double precision)  AS max_val,`;
      // Only include rows where the field is a valid number
      whereAgg = `AND (processed_data->>${fieldParam}) ~ '^-?[0-9]+(\\.[0-9]+)?$'`;
    } else {
      selectAgg = `
        NULL::double precision AS avg_val,
        NULL::double precision AS min_val,
        NULL::double precision AS max_val,`;
    }

    const result = await this.pool.query(
      `SELECT time_bucket($1::interval, phenomenon_time) AS bucket,
              ${selectAgg}
              COUNT(*)::int AS sample_count
       FROM sensor_readings
       WHERE sensor_id = $2
         AND phenomenon_time >= $3
         AND phenomenon_time <= $4
         ${qualityClause}
         ${whereAgg}
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
