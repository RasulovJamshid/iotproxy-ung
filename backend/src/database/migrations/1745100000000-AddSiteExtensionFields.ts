import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSiteExtensionFields1745100000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    // Add geolocation fields
    await qr.query(`
      ALTER TABLE sites
      ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 7),
      ADD COLUMN IF NOT EXISTS longitude DECIMAL(10, 7),
      ADD COLUMN IF NOT EXISTS timezone VARCHAR(255)
    `);

    // Add site classification
    await qr.query(`
      ALTER TABLE sites
      ADD COLUMN IF NOT EXISTS site_type VARCHAR(50)
    `);

    // Add flexible metadata fields (JSONB)
    await qr.query(`
      ALTER TABLE sites
      ADD COLUMN IF NOT EXISTS tags JSONB,
      ADD COLUMN IF NOT EXISTS metadata JSONB,
      ADD COLUMN IF NOT EXISTS custom_fields JSONB
    `);

    // Create indexes for common queries
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_sites_site_type ON sites(site_type)
    `);

    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_sites_tags ON sites USING GIN(tags)
    `);

    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_sites_metadata ON sites USING GIN(metadata)
    `);

    // Add spatial index for geolocation queries (if PostGIS is available)
    // Uncomment if you have PostGIS extension enabled
    // await qr.query(`
    //   CREATE INDEX IF NOT EXISTS idx_sites_location 
    //   ON sites USING GIST(ST_MakePoint(longitude, latitude))
    //   WHERE latitude IS NOT NULL AND longitude IS NOT NULL
    // `);
  }

  async down(qr: QueryRunner): Promise<void> {
    // Drop indexes
    await qr.query(`DROP INDEX IF EXISTS idx_sites_metadata`);
    await qr.query(`DROP INDEX IF EXISTS idx_sites_tags`);
    await qr.query(`DROP INDEX IF EXISTS idx_sites_site_type`);
    // await qr.query(`DROP INDEX IF EXISTS idx_sites_location`);

    // Drop columns
    await qr.query(`
      ALTER TABLE sites
      DROP COLUMN IF EXISTS custom_fields,
      DROP COLUMN IF EXISTS metadata,
      DROP COLUMN IF EXISTS tags,
      DROP COLUMN IF EXISTS site_type,
      DROP COLUMN IF EXISTS timezone,
      DROP COLUMN IF EXISTS longitude,
      DROP COLUMN IF EXISTS latitude
    `);
  }
}
