import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserOrganizations1744900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS user_organizations (
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        role VARCHAR NOT NULL DEFAULT 'USER',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (user_id, organization_id)
      )
    `);

    // Migrate existing memberships from users table
    // For SYSTEM_ADMIN we still create a membership in their org with ADMIN role
    await queryRunner.query(`
      INSERT INTO user_organizations (user_id, organization_id, role)
      SELECT
        id,
        organization_id,
        CASE WHEN role = 'SYSTEM_ADMIN' THEN 'ADMIN' ELSE role END
      FROM users
      WHERE organization_id IS NOT NULL
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS user_organizations`);
  }
}
