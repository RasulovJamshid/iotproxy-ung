import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * This migration was originally placed in backend/migrations/ (wrong path) and never ran.
 * TypeORM only reads from backend/src/database/migrations/. Moving it here with a new
 * timestamp so it runs correctly. All statements use IF NOT EXISTS so they are safe
 * to run even if some columns/tables already exist from manual setup.
 */
export class AddRetentionSchema1746200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Organization-level retention defaults ────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE organizations
        ADD COLUMN IF NOT EXISTS default_raw_retention_days      INT          DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS default_summary_retention_months INT         DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS default_summary_agg_mode        VARCHAR(10)  DEFAULT 'AVG'
    `);

    // Backfill: copy old raw_retention_days (org-level absolute limit) into the
    // new default_raw_retention_days field so existing org policies are preserved.
    await queryRunner.query(`
      UPDATE organizations
        SET default_raw_retention_days = raw_retention_days
        WHERE raw_retention_days IS NOT NULL
          AND default_raw_retention_days IS NULL
    `);

    // ── Sensor-level retention overrides ─────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE sensors
        ADD COLUMN IF NOT EXISTS raw_retention_days       INT          DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS summary_retention_months INT          DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS summary_agg_mode         VARCHAR(10)  DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS agg_field                VARCHAR(100) DEFAULT 'value'
    `);

    // ── Daily summary table ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS readings_daily_summary (
        sensor_id         UUID             NOT NULL,
        organization_id   UUID             NOT NULL,
        day               DATE             NOT NULL,
        avg_val           DOUBLE PRECISION,
        min_val           DOUBLE PRECISION,
        max_val           DOUBLE PRECISION,
        latest_val        DOUBLE PRECISION,
        sum_val           DOUBLE PRECISION,
        sample_count      INT              NOT NULL DEFAULT 0,
        agg_field         VARCHAR(100),
        created_at        TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
        PRIMARY KEY (sensor_id, day)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_daily_summary_org_day
        ON readings_daily_summary (organization_id, day)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_daily_summary_sensor_day
        ON readings_daily_summary (sensor_id, day DESC)
    `);

    // ── Site-level retention overrides ────────────────────────────────────────
    // Used by getSensorsNeedingRollup to resolve the per-sensor retention
    // priority chain: sensor → site → org.
    await queryRunner.query(`
      ALTER TABLE sites
        ADD COLUMN IF NOT EXISTS default_raw_retention_days       INT         DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS default_summary_retention_months INT         DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS default_summary_agg_mode         VARCHAR(10) DEFAULT NULL
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
      ALTER TABLE sites
        DROP COLUMN IF EXISTS default_raw_retention_days,
        DROP COLUMN IF EXISTS default_summary_retention_months,
        DROP COLUMN IF EXISTS default_summary_agg_mode
    `);

    await queryRunner.query(`
      ALTER TABLE organizations
        DROP COLUMN IF EXISTS default_raw_retention_days,
        DROP COLUMN IF EXISTS default_summary_retention_months,
        DROP COLUMN IF EXISTS default_summary_agg_mode
    `);
  }
}
