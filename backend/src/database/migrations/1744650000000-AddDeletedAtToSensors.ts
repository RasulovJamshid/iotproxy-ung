import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeletedAtToSensors1744650000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sensors
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ
    `);

    await queryRunner.query(`
      ALTER TABLE virtual_sensors
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sensors
      DROP COLUMN deleted_at
    `);

    await queryRunner.query(`
      ALTER TABLE virtual_sensors
      DROP COLUMN deleted_at
    `);
  }
}
