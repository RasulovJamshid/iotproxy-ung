import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Consolidates several migrations that were placed in backend/migrations/ (wrong path)
 * and never ran via the TypeORM migration runner. All statements are idempotent.
 *
 * Covers:
 *   - sensor_types and sensor_categories tables
 *   - site_groups table + sites.group_id
 *   - Site geo/meta columns (latitude, longitude, timezone, site_type, tags, metadata, custom_fields)
 *   - site_adapters.pull_time_params (required for backfill date-range injection)
 */
export class AddMissingSchema1746300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Sensor types ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sensor_types (
        id              UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID  NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name            TEXT  NOT NULL,
        description     TEXT,
        icon            TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_sensor_types_org_name
        ON sensor_types(organization_id, name)
    `);

    // ── Sensor categories ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sensor_categories (
        id              UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID  NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name            TEXT  NOT NULL,
        description     TEXT,
        color           TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_sensor_categories_org_name
        ON sensor_categories(organization_id, name)
    `);

    // Add type_id and category_id to sensors
    await queryRunner.query(`
      ALTER TABLE sensors
        ADD COLUMN IF NOT EXISTS type_id     UUID REFERENCES sensor_types(id)       ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES sensor_categories(id)  ON DELETE SET NULL
    `);

    // ── Site groups ───────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS site_groups (
        id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name            TEXT        NOT NULL,
        description     TEXT,
        color           TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_site_groups_org_name
        ON site_groups(organization_id, name)
    `);

    await queryRunner.query(`
      ALTER TABLE sites
        ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES site_groups(id) ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_sites_group_id ON sites(group_id)
    `);

    // ── Site geo and metadata columns ─────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE sites
        ADD COLUMN IF NOT EXISTS latitude      DECIMAL(10,7),
        ADD COLUMN IF NOT EXISTS longitude     DECIMAL(10,7),
        ADD COLUMN IF NOT EXISTS timezone      TEXT,
        ADD COLUMN IF NOT EXISTS site_type     TEXT,
        ADD COLUMN IF NOT EXISTS tags          JSONB,
        ADD COLUMN IF NOT EXISTS metadata      JSONB,
        ADD COLUMN IF NOT EXISTS custom_fields JSONB
    `);

    // ── site_adapters.pull_time_params ────────────────────────────────────────
    // Required for backfill: stores the time-range parameter config so adapters
    // can inject window start/end into each backfill API request.
    await queryRunner.query(`
      ALTER TABLE site_adapters
        ADD COLUMN IF NOT EXISTS pull_time_params JSONB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE site_adapters DROP COLUMN IF EXISTS pull_time_params`);

    await queryRunner.query(`
      ALTER TABLE sites
        DROP COLUMN IF EXISTS latitude,
        DROP COLUMN IF EXISTS longitude,
        DROP COLUMN IF EXISTS timezone,
        DROP COLUMN IF EXISTS site_type,
        DROP COLUMN IF EXISTS tags,
        DROP COLUMN IF EXISTS metadata,
        DROP COLUMN IF EXISTS custom_fields
    `);

    await queryRunner.query(`ALTER TABLE sites DROP COLUMN IF EXISTS group_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS site_groups`);

    await queryRunner.query(`
      ALTER TABLE sensors
        DROP COLUMN IF EXISTS type_id,
        DROP COLUMN IF EXISTS category_id
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS sensor_categories`);
    await queryRunner.query(`DROP TABLE IF EXISTS sensor_types`);
  }
}
