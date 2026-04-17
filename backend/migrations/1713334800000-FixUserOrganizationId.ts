import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixUserOrganizationId1713334800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // First, check if there are any users with NULL organization_id
    const usersWithNullOrg = await queryRunner.query(
      'SELECT id, email FROM users WHERE organization_id IS NULL'
    );

    if (usersWithNullOrg.length > 0) {
      console.log(`Found ${usersWithNullOrg.length} users with NULL organization_id`);
      
      // Get the first organization (or create a default one)
      const orgs = await queryRunner.query('SELECT id FROM organizations LIMIT 1');
      
      if (orgs.length === 0) {
        // Create a default organization if none exists
        const result = await queryRunner.query(
          `INSERT INTO organizations (name, slug, is_active) 
           VALUES ('Default Organization', 'default', true) 
           RETURNING id`
        );
        const defaultOrgId = result[0].id;
        
        // Update all users with NULL organization_id to use the default org
        await queryRunner.query(
          'UPDATE users SET organization_id = $1 WHERE organization_id IS NULL',
          [defaultOrgId]
        );
        console.log(`Assigned ${usersWithNullOrg.length} users to default organization`);
      } else {
        const firstOrgId = orgs[0].id;
        
        // Update all users with NULL organization_id to use the first org
        await queryRunner.query(
          'UPDATE users SET organization_id = $1 WHERE organization_id IS NULL',
          [firstOrgId]
        );
        console.log(`Assigned ${usersWithNullOrg.length} users to organization ${firstOrgId}`);
      }
    }

    // Now make the column NOT NULL if it isn't already
    await queryRunner.query(
      'ALTER TABLE users ALTER COLUMN organization_id SET NOT NULL'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Make the column nullable again
    await queryRunner.query(
      'ALTER TABLE users ALTER COLUMN organization_id DROP NOT NULL'
    );
  }
}
