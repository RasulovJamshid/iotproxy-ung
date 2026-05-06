import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBackfillRunTimeParams1746100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE backfill_runs
        ADD COLUMN IF NOT EXISTS time_params JSONB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE backfill_runs DROP COLUMN IF EXISTS time_params
    `);
  }
}
