import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddApiKeyScopes1744950000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    // Add scope_type column to api_keys (default SITES preserves existing single-site behaviour)
    await qr.query(`
      ALTER TABLE api_keys
      ADD COLUMN IF NOT EXISTS scope_type VARCHAR(10) NOT NULL DEFAULT 'SITES'
    `);

    // New table: one row per (key, org, optional site)
    await qr.query(`
      CREATE TABLE IF NOT EXISTS api_key_scopes (
        id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        api_key_id  UUID        NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
        org_id      UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        site_id     UUID        REFERENCES sites(id) ON DELETE CASCADE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_api_key_scopes_key_id ON api_key_scopes(api_key_id)
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS api_key_scopes`);
    await qr.query(`ALTER TABLE api_keys DROP COLUMN IF EXISTS scope_type`);
  }
}
