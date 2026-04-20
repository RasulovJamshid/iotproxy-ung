import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSiteGeoAndMeta1745200000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sites
        ADD COLUMN IF NOT EXISTS latitude     DECIMAL(10,7),
        ADD COLUMN IF NOT EXISTS longitude    DECIMAL(10,7),
        ADD COLUMN IF NOT EXISTS timezone     TEXT,
        ADD COLUMN IF NOT EXISTS site_type    TEXT,
        ADD COLUMN IF NOT EXISTS tags         JSONB,
        ADD COLUMN IF NOT EXISTS metadata     JSONB,
        ADD COLUMN IF NOT EXISTS custom_fields JSONB
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
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
  }
}
