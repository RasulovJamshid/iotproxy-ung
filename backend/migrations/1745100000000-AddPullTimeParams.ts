import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPullTimeParams1745100000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE site_adapters
      ADD COLUMN IF NOT EXISTS pull_time_params JSONB
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE site_adapters
      DROP COLUMN IF EXISTS pull_time_params
    `);
  }
}
