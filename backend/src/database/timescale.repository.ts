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

  async queryTimeSeries(params: TimeSeriesQueryParams) {
    const rangeMs = params.endTs.getTime() - params.startTs.getTime();
    const now = Date.now();
    const oneHourAgo = now - 3_600_000;
    const oneDayAgo  = now - 86_400_000;
    const sixHours   = 6 * 3_600_000;
    const sevenDays  = 7 * 86_400_000;

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
