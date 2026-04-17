import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient } from 'pg';
import { ProcessedReading } from '@iotproxy/shared';

const ALLOWED_VIEWS = new Set(['sensor_readings', 'readings_1h', 'readings_1d']);
const ALLOWED_TIME_COLS = new Set(['phenomenon_time', 'bucket']);

export interface TimeSeriesQueryParams {
  sensorId: string;
  startTs: Date;
  endTs: Date;
  agg: 'AVG' | 'MIN' | 'MAX' | 'SUM' | 'COUNT' | 'NONE';
  intervalMs?: number;
  limit?: number;
  cursor?: Date;
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
    const oneDayAgo = now - 86_400_000;
    const sixHours = 6 * 3_600_000;
    const sevenDays = 7 * 86_400_000;

    // Always use raw data if aggregation is disabled
    if (params.agg === 'NONE') {
      return this.queryRaw(params);
    }

    // readings_1h only contains data older than 1 hour (due to end_offset policy)
    // If query includes data from the last hour, use raw data but transform to aggregate format
    if (params.endTs.getTime() > oneHourAgo) {
      return this.transformRawToAggregate(params);
    }

    // For small ranges, use raw data transformed to aggregates
    if (rangeMs < sixHours) {
      return this.transformRawToAggregate(params);
    }

    // readings_1d only contains data older than 1 day (due to end_offset policy)
    // If query includes data from the last day, use hourly aggregate or raw
    if (rangeMs >= sevenDays) {
      if (params.endTs.getTime() > oneDayAgo) {
        // Query spans multiple days but includes recent data - use hourly
        return this.queryAggregate('readings_1h', 'bucket', params);
      }
      // All data is older than 1 day - safe to use daily aggregate
      return this.queryAggregate('readings_1d', 'bucket', params);
    }

    // Range is 6h-7d and data is older than 1 hour - use hourly aggregate
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
         AND phenomenon_time < NOW() - ($2 || ' days')::interval`,
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

  private extractNumericValue(processedData: any): number | null {
    if (!processedData || typeof processedData !== 'object') return null;
    
    // Try common field names first
    const commonFields = ['value', 'temperature', 'humidity', 'pressure', 'voltage', 'current', 'power'];
    for (const field of commonFields) {
      if (processedData[field] !== undefined && processedData[field] !== null) {
        const val = Number(processedData[field]);
        if (!isNaN(val)) return val;
      }
    }
    
    // Fallback: find first numeric value in any field
    for (const key in processedData) {
      const val = Number(processedData[key]);
      if (!isNaN(val)) return val;
    }
    
    return null;
  }

  private async transformRawToAggregate(params: TimeSeriesQueryParams) {
    // Get raw data
    const rawData = await this.queryRaw(params);
    
    // Group raw readings into buckets and compute aggregates
    const bucketMap = new Map<number, number[]>();
    const bucketSize = (params.intervalMs ?? 3_600_000);
    
    for (const row of rawData) {
      const timestamp = new Date(row.phenomenon_time).getTime();
      const bucketTime = Math.floor(timestamp / bucketSize) * bucketSize;
      
      // Extract numeric value from processed_data
      const value = this.extractNumericValue(row.processed_data);
      if (value !== null) {
        if (!bucketMap.has(bucketTime)) {
          bucketMap.set(bucketTime, []);
        }
        bucketMap.get(bucketTime)!.push(value);
      }
    }
    
    // Convert buckets to aggregate format
    const aggregates = Array.from(bucketMap.entries())
      .map(([bucketTime, values]) => ({
        bucket: new Date(bucketTime),
        avg_val: values.reduce((a, b) => a + b, 0) / values.length,
        min_val: Math.min(...values),
        max_val: Math.max(...values),
        sample_count: values.length,
      }))
      .sort((a, b) => b.bucket.getTime() - a.bucket.getTime())
      .slice(0, params.limit ?? 1000);
    
    return aggregates;
  }

  private async queryRaw(params: TimeSeriesQueryParams) {
    const args: unknown[] = [params.sensorId, params.startTs, params.endTs];
    let cursorClause = '';

    if (params.cursor) {
      args.push(params.cursor);
      cursorClause = `AND phenomenon_time < $${args.length}`;
    }

    args.push(params.limit ?? 1000);
    const limitPlaceholder = `$${args.length}`;

    const result = await this.pool.query(
      `SELECT phenomenon_time, processed_data, quality_code, pipeline_flags
       FROM sensor_readings
       WHERE sensor_id = $1
         AND phenomenon_time >= $2
         AND phenomenon_time <= $3
         ${cursorClause}
       ORDER BY phenomenon_time DESC
       LIMIT ${limitPlaceholder}`,
      args,
    );

    return result.rows;
  }

  private async queryAggregate(
    view: string,
    timeCol: string,
    params: TimeSeriesQueryParams,
  ) {
    // Allowlist check — prevents SQL injection if view/timeCol are ever passed from user input
    if (!ALLOWED_VIEWS.has(view) || !ALLOWED_TIME_COLS.has(timeCol)) {
      throw new Error(`Invalid aggregate target: ${view}.${timeCol}`);
    }

    const intervalSec = Math.floor((params.intervalMs ?? 3_600_000) / 1000);

    try {
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
        [
          `${intervalSec} seconds`,
          params.sensorId,
          params.startTs,
          params.endTs,
          params.limit ?? 1000,
        ],
      );

      return result.rows;
    } catch (err) {
      // If aggregate query fails (e.g., view not populated yet), fallback to raw data
      this.logger.warn(`Aggregate query failed for ${view}, falling back to raw data: ${err instanceof Error ? err.message : String(err)}`);
      return this.transformRawToAggregate(params);
    }
  }
}
