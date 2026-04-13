import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the full application schema from scratch.
 * Must run before all other migrations (timestamp 0000000000001).
 *
 * All statements use CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS
 * so this migration is safe to run against a database that was partially
 * initialized by an older mechanism (e.g. synchronize: true in development).
 *
 * Tables that are also targeted by later migrations (user_organizations,
 * api_key_scopes, adapter_templates) are created here in their final form;
 * those migrations use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS so they
 * become no-ops on a fresh install.
 *
 * Notable omission: idx_field_profiles_site_field is intentionally NOT
 * created here — migration 1712748000000 owns that index.
 */
export class InitialSchema0000000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── organizations ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS organizations (
        id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        name               TEXT        UNIQUE NOT NULL,
        slug               TEXT        UNIQUE NOT NULL,
        rate_limit_rpm     INT         NOT NULL DEFAULT 10000,
        raw_retention_days INT,
        is_active          BOOLEAN     NOT NULL DEFAULT true,
        created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ── users ─────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS users (
        id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id  UUID        NOT NULL,
        email            TEXT        UNIQUE NOT NULL,
        password_hash    TEXT        NOT NULL,
        role             TEXT        NOT NULL DEFAULT 'USER',
        is_active        BOOLEAN     NOT NULL DEFAULT true,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ── user_organizations ────────────────────────────────────────────────────
    // Also created by migration 1744900000000 (CREATE TABLE IF NOT EXISTS → no-op)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS user_organizations (
        user_id          UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        organization_id  UUID    NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        role             VARCHAR NOT NULL DEFAULT 'USER',
        created_at       TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (user_id, organization_id)
      )
    `);

    // ── sites ─────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sites (
        id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id          UUID        NOT NULL REFERENCES organizations(id),
        name                     TEXT        NOT NULL,
        description              TEXT,
        commissioning_status     TEXT        NOT NULL DEFAULT 'DISCOVERY',
        discovery_window_ends_at TIMESTAMPTZ,
        discovery_enabled        BOOLEAN     NOT NULL DEFAULT false,
        connectivity_status      TEXT        NOT NULL DEFAULT 'UNKNOWN',
        last_seen_at             TIMESTAMPTZ,
        timescale_chunk_interval TEXT        NOT NULL DEFAULT '7 days',
        created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ── sensors ───────────────────────────────────────────────────────────────
    // max_records_per_sensor  — also added by migration 1744287600000 (ADD COLUMN IF NOT EXISTS → no-op)
    // deleted_at              — also added by migration 1744650000000 (ADD COLUMN IF NOT EXISTS → no-op)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sensors (
        id                         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id            UUID        NOT NULL,
        site_id                    UUID        NOT NULL REFERENCES sites(id),
        name                       TEXT        NOT NULL,
        external_id                TEXT,
        description                TEXT,
        status                     TEXT        NOT NULL DEFAULT 'MAINTENANCE',
        connectivity_status        TEXT        NOT NULL DEFAULT 'UNKNOWN',
        last_reading_at            TIMESTAMPTZ,
        reporting_interval_seconds INT,
        max_records_per_sensor     INT         DEFAULT 10,
        deleted_at                 TIMESTAMPTZ,
        created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    // Note: the (site_id, external_id) partial unique index is created by
    // migration 1744652000000-ScopeSensorExternalIdToSite. On a fresh database
    // there is no old UQ_sensors_external_id to drop, so that migration runs cleanly.

    // ── field_profiles ────────────────────────────────────────────────────────
    // idx_field_profiles_site_field is intentionally NOT created here.
    // Migration 1712748000000 deduplicates rows and then creates that index.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS field_profiles (
        id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        site_id        UUID        NOT NULL,
        field_key      TEXT        NOT NULL,
        sample_count   INT         NOT NULL DEFAULT 0,
        mean           FLOAT       NOT NULL DEFAULT 0,
        m2             FLOAT       NOT NULL DEFAULT 0,
        min_val        FLOAT,
        max_val        FLOAT,
        suggested_unit TEXT,
        sample_types   JSONB       NOT NULL DEFAULT '{}',
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ── api_keys ──────────────────────────────────────────────────────────────
    // scope_type — also added by migration 1744950000000 (ADD COLUMN IF NOT EXISTS → no-op)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id        UUID        NOT NULL,
        site_id                UUID,
        scope_type             VARCHAR(10) NOT NULL DEFAULT 'SITES',
        name                   TEXT        NOT NULL,
        prefix                 VARCHAR(16) NOT NULL,
        key_hash               TEXT        NOT NULL,
        permissions            TEXT        NOT NULL DEFAULT 'ingest',
        websocket_enabled      BOOLEAN     NOT NULL DEFAULT true,
        expires_at             TIMESTAMPTZ,
        revoked_at             TIMESTAMPTZ,
        last_used_at           TIMESTAMPTZ,
        expiry_warning_sent_at TIMESTAMPTZ,
        created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys (prefix)
    `);

    // ── api_key_scopes ────────────────────────────────────────────────────────
    // Also created by migration 1744950000000 (CREATE TABLE IF NOT EXISTS → no-op)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS api_key_scopes (
        id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        api_key_id  UUID        NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
        org_id      UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        site_id     UUID        REFERENCES sites(id) ON DELETE CASCADE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_api_key_scopes_key_id ON api_key_scopes (api_key_id)
    `);

    // ── site_adapters ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS site_adapters (
        id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        site_id               UUID        UNIQUE NOT NULL REFERENCES sites(id),
        organization_id       UUID        NOT NULL,
        inbound_enabled       BOOLEAN     NOT NULL DEFAULT false,
        inbound_mapping       JSONB,
        pull_enabled          BOOLEAN     NOT NULL DEFAULT false,
        pull_url              TEXT,
        pull_method           TEXT        NOT NULL DEFAULT 'GET',
        pull_headers          JSONB,
        pull_query_params     JSONB,
        pull_auth_type        TEXT        NOT NULL DEFAULT 'none',
        pull_auth_config      JSONB,
        pull_body_template    JSONB,
        pull_interval_sec     INT         NOT NULL DEFAULT 60,
        response_mapping      JSONB,
        pull_last_at          TIMESTAMPTZ,
        pull_last_status_code INT,
        pull_last_error       TEXT,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ── adapter_templates ─────────────────────────────────────────────────────
    // Also created by migration 1745000000000 (CREATE TABLE IF NOT EXISTS → no-op)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS adapter_templates (
        id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id    UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name               TEXT        NOT NULL,
        description        TEXT,
        inbound_mapping    JSONB,
        pull_method        VARCHAR(10) NOT NULL DEFAULT 'GET',
        pull_headers       JSONB,
        pull_query_params  JSONB,
        pull_auth_type     VARCHAR(20) NOT NULL DEFAULT 'none',
        pull_auth_config   JSONB,
        pull_body_template JSONB,
        pull_interval_sec  INT         NOT NULL DEFAULT 300,
        response_mapping   JSONB,
        created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_adapter_templates_org_id ON adapter_templates (organization_id)
    `);

    // ── sensor_configs ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sensor_configs (
        id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        sensor_id           UUID        NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
        is_active           BOOLEAN     NOT NULL DEFAULT true,
        alias               TEXT,
        unit                TEXT,
        scale_multiplier    FLOAT       NOT NULL DEFAULT 1.0,
        scale_offset        FLOAT       NOT NULL DEFAULT 0.0,
        expected_min        FLOAT,
        expected_max        FLOAT,
        reject_out_of_range BOOLEAN     NOT NULL DEFAULT false,
        field_mappings      JSONB       NOT NULL DEFAULT '{}',
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ── sensor_config_versions ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sensor_config_versions (
        id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        config_id  UUID        NOT NULL REFERENCES sensor_configs(id) ON DELETE CASCADE,
        version    INT         NOT NULL,
        snapshot   JSONB       NOT NULL,
        changed_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ── virtual_sensors ───────────────────────────────────────────────────────
    // deleted_at — also added by migration 1744650000000 (ADD COLUMN IF NOT EXISTS → no-op)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS virtual_sensors (
        id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id  UUID        NOT NULL,
        site_id          UUID        NOT NULL,
        source_sensor_id UUID        NOT NULL,
        name             TEXT        NOT NULL,
        formula          TEXT        NOT NULL,
        unit             TEXT,
        is_active        BOOLEAN     NOT NULL DEFAULT true,
        deleted_at       TIMESTAMPTZ,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ── alert_rules ───────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS alert_rules (
        id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id       UUID        NOT NULL,
        site_id               UUID,
        sensor_id             UUID,
        field                 TEXT        NOT NULL,
        operator              TEXT        NOT NULL,
        threshold             FLOAT       NOT NULL,
        window_seconds        INT         NOT NULL DEFAULT 0,
        severity              TEXT        NOT NULL DEFAULT 'WARNING',
        cooldown_seconds      INT         NOT NULL DEFAULT 300,
        notification_channels JSONB       NOT NULL DEFAULT '[]',
        is_active             BOOLEAN     NOT NULL DEFAULT true,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ── alert_events ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS alert_events (
        id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        alert_rule_id        UUID        NOT NULL,
        sensor_id            UUID        NOT NULL,
        site_id              UUID        NOT NULL,
        organization_id      UUID        NOT NULL,
        state                TEXT        NOT NULL,
        value                FLOAT       NOT NULL,
        threshold            FLOAT       NOT NULL,
        severity             TEXT        NOT NULL,
        correlation_id       TEXT,
        notification_sent_at TIMESTAMPTZ,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_alert_events_rule_id ON alert_events (alert_rule_id)
    `);

    // ── webhooks ──────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS webhooks (
        id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID        NOT NULL,
        url             TEXT        NOT NULL,
        signing_secret  TEXT        NOT NULL,
        events          TEXT        NOT NULL,
        is_active       BOOLEAN     NOT NULL DEFAULT true,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ── audit_logs ────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID        NOT NULL,
        actor_id        TEXT,
        actor_email     TEXT,
        action          TEXT        NOT NULL,
        resource_type   TEXT        NOT NULL,
        resource_id     TEXT,
        diff            JSONB,
        ip_address      TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_org_id ON audit_logs (organization_id)
    `);

    // ── export_jobs ───────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS export_jobs (
        id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id    UUID        NOT NULL,
        site_id            UUID        NOT NULL,
        start_ts           TIMESTAMPTZ NOT NULL,
        end_ts             TIMESTAMPTZ NOT NULL,
        format             TEXT        NOT NULL DEFAULT 'csv',
        fields             TEXT,
        status             TEXT        NOT NULL DEFAULT 'PENDING',
        progress           INT         NOT NULL DEFAULT 0,
        estimated_readings INT,
        download_url       TEXT,
        error_message      TEXT,
        created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop in reverse FK-dependency order
    await queryRunner.query(`DROP TABLE IF EXISTS export_jobs`);
    await queryRunner.query(`DROP TABLE IF EXISTS audit_logs`);
    await queryRunner.query(`DROP TABLE IF EXISTS webhooks`);
    await queryRunner.query(`DROP TABLE IF EXISTS alert_events`);
    await queryRunner.query(`DROP TABLE IF EXISTS alert_rules`);
    await queryRunner.query(`DROP TABLE IF EXISTS virtual_sensors`);
    await queryRunner.query(`DROP TABLE IF EXISTS sensor_config_versions`);
    await queryRunner.query(`DROP TABLE IF EXISTS sensor_configs`);
    await queryRunner.query(`DROP TABLE IF EXISTS adapter_templates`);
    await queryRunner.query(`DROP TABLE IF EXISTS site_adapters`);
    await queryRunner.query(`DROP TABLE IF EXISTS api_key_scopes`);
    await queryRunner.query(`DROP TABLE IF EXISTS api_keys`);
    await queryRunner.query(`DROP TABLE IF EXISTS field_profiles`);
    await queryRunner.query(`DROP TABLE IF EXISTS sensors`);
    await queryRunner.query(`DROP TABLE IF EXISTS sites`);
    await queryRunner.query(`DROP TABLE IF EXISTS user_organizations`);
    await queryRunner.query(`DROP TABLE IF EXISTS users`);
    await queryRunner.query(`DROP TABLE IF EXISTS organizations`);
  }
}
