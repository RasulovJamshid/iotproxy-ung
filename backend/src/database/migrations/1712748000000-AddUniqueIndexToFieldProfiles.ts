import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUniqueIndexToFieldProfiles1712748000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // First, remove duplicate field profiles, keeping only the most recent one per (site_id, field_key)
    await queryRunner.query(`
      DELETE FROM field_profiles
      WHERE id NOT IN (
        SELECT DISTINCT ON (site_id, field_key) id
        FROM field_profiles
        ORDER BY site_id, field_key, updated_at DESC
      )
    `);

    // Now add the unique index to prevent future duplicates
    await queryRunner.query(`
      CREATE UNIQUE INDEX idx_field_profiles_site_field 
      ON field_profiles (site_id, field_key)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_field_profiles_site_field
    `);
  }
}
