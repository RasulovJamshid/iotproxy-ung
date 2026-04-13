import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMaxRecordsPerSensor1744287600000 implements MigrationInterface {
  name = 'AddMaxRecordsPerSensor1744287600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sensors"
      ADD COLUMN IF NOT EXISTS "max_records_per_sensor" integer DEFAULT 10
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sensors"
      DROP COLUMN IF EXISTS "max_records_per_sensor"
    `);
  }
}
