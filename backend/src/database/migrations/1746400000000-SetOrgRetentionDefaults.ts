import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sets a default raw retention policy (7 days) for any organisation that still has
 * NULL in default_raw_retention_days after the AddRetentionSchema migration ran.
 *
 * Without this, getSensorsNeedingRollup returns an empty set for every query and
 * retention never runs — not even for sensors with lots of historical data.
 *
 * The 7-day default matches the TypeORM entity `default: 7` already declared on
 * Organisation.defaultRawRetentionDays so new orgs always get this value.
 */
export class SetOrgRetentionDefaults1746400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Set 7-day raw retention for every org that has no policy at all.
    // Orgs that already have a value (copied from raw_retention_days in the
    // previous migration) are left untouched.
    await queryRunner.query(`
      UPDATE organizations
        SET default_raw_retention_days = 7
        WHERE default_raw_retention_days IS NULL
    `);

    // Ensure the column has a DB-level default so future inserts via raw SQL
    // also get 7 when the application omits the field.
    await queryRunner.query(`
      ALTER TABLE organizations
        ALTER COLUMN default_raw_retention_days SET DEFAULT 7
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE organizations
        ALTER COLUMN default_raw_retention_days DROP DEFAULT
    `);
  }
}
