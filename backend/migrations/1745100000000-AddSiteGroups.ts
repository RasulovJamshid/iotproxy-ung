import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSiteGroups1745100000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
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
        ADD COLUMN IF NOT EXISTS group_id UUID
          REFERENCES site_groups(id) ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_sites_group_id ON sites(group_id)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE sites DROP COLUMN IF EXISTS group_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS site_groups`);
  }
}
