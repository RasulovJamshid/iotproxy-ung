import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdapterTemplates1745000000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
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

    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_adapter_templates_org_id ON adapter_templates(organization_id)
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS adapter_templates`);
  }
}
