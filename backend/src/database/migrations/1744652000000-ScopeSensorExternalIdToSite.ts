import { MigrationInterface, QueryRunner } from 'typeorm';

export class ScopeSensorExternalIdToSite1744652000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the old global unique index on external_id
    await queryRunner.query(`
      ALTER TABLE sensors
      DROP CONSTRAINT IF EXISTS "UQ_sensors_external_id"
    `);

    // TypeORM may have named it differently — drop by column as a fallback
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_sensors_external_id"
    `);

    // Create composite unique index scoped to (site_id, external_id)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_sensors_site_external_id"
        ON sensors (site_id, external_id)
       WHERE external_id IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove the composite index
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_sensors_site_external_id"
    `);

    // Restore the original global unique constraint
    await queryRunner.query(`
      ALTER TABLE sensors
      ADD CONSTRAINT "UQ_sensors_external_id" UNIQUE (external_id)
    `);
  }
}
