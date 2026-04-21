import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSiteRetentionDefaults1745400000000 implements MigrationInterface {
  async up(runner: QueryRunner) {
    await runner.query(`
      ALTER TABLE sites
        ADD COLUMN IF NOT EXISTS default_raw_retention_days       INT,
        ADD COLUMN IF NOT EXISTS default_summary_retention_months INT,
        ADD COLUMN IF NOT EXISTS default_summary_agg_mode         VARCHAR(10)
    `);
  }

  async down(runner: QueryRunner) {
    await runner.query(`
      ALTER TABLE sites
        DROP COLUMN IF EXISTS default_raw_retention_days,
        DROP COLUMN IF EXISTS default_summary_retention_months,
        DROP COLUMN IF EXISTS default_summary_agg_mode
    `);
  }
}
