import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRetentionAndDailySummary1745300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. New columns on organizations ─────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE organizations
        ADD COLUMN IF NOT EXISTS default_raw_retention_days INT DEFAULT 7,
        ADD COLUMN IF NOT EXISTS default_summary_retention_months INT DEFAULT 6,
        ADD COLUMN IF NOT EXISTS default_summary_agg_mode VARCHAR(10) DEFAULT 'AVG'
    `);

    // ── 2. New columns on sensors ───────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE sensors
        ADD COLUMN IF NOT EXISTS raw_retention_days INT DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS summary_retention_months INT DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS summary_agg_mode VARCHAR(10) DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS agg_field VARCHAR(100) DEFAULT 'value'
    `);

    // ── 3. Create readings_daily_summary table ──────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS readings_daily_summary (
        sensor_id         UUID            NOT NULL,
        organization_id   UUID            NOT NULL,
        day               DATE            NOT NULL,
        avg_val           DOUBLE PRECISION,
        min_val           DOUBLE PRECISION,
        max_val           DOUBLE PRECISION,
        latest_val        DOUBLE PRECISION,
        sum_val           DOUBLE PRECISION,
        sample_count      INT             NOT NULL DEFAULT 0,
        agg_field         VARCHAR(100),
        created_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
        PRIMARY KEY (sensor_id, day)
      )
    `);

    // Index for retention purge (by org + day)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_daily_summary_org_day
        ON readings_daily_summary (organization_id, day)
    `);

    // Index for querying summaries by sensor + day range
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_daily_summary_sensor_day
        ON readings_daily_summary (sensor_id, day DESC)
    `);

    // ── 4. Migrate existing raw_retention_days on organizations ─────────────
    // Copy org-level rawRetentionDays into the new default_raw_retention_days
    await queryRunner.query(`
      UPDATE organizations
        SET default_raw_retention_days = raw_retention_days
        WHERE raw_retention_days IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS readings_daily_summary`);

    await queryRunner.query(`
      ALTER TABLE sensors
        DROP COLUMN IF EXISTS raw_retention_days,
        DROP COLUMN IF EXISTS summary_retention_months,
        DROP COLUMN IF EXISTS summary_agg_mode,
        DROP COLUMN IF EXISTS agg_field
    `);

    await queryRunner.query(`
      ALTER TABLE organizations
        DROP COLUMN IF EXISTS default_raw_retention_days,
        DROP COLUMN IF EXISTS default_summary_retention_months,
        DROP COLUMN IF EXISTS default_summary_agg_mode
    `);
  }
}
