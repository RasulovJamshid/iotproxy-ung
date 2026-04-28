import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixRetentionDefaults1745200000000 implements MigrationInterface {
  name = 'FixRetentionDefaults1745200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Remove the column-level DEFAULT 10 — new sensors should get NULL (no record limit).
    // Time-based retention (rawRetentionDays) is the primary mechanism now.
    await queryRunner.query(`
      ALTER TABLE "sensors"
      ALTER COLUMN "max_records_per_sensor" DROP DEFAULT
    `);

    // Set existing sensors that still have the old default of 10 to NULL,
    // so they use time-based retention instead of record-count truncation.
    await queryRunner.query(`
      UPDATE "sensors"
      SET "max_records_per_sensor" = NULL
      WHERE "max_records_per_sensor" = 10
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Restore the old default
    await queryRunner.query(`
      ALTER TABLE "sensors"
      ALTER COLUMN "max_records_per_sensor" SET DEFAULT 10
    `);

    // Restore NULL values to 10
    await queryRunner.query(`
      UPDATE "sensors"
      SET "max_records_per_sensor" = 10
      WHERE "max_records_per_sensor" IS NULL
    `);
  }
}
