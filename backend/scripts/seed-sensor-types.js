/**
 * Seed default sensor types and categories for all organizations
 * Run with: node backend/scripts/seed-sensor-types.js
 */

const { DataSource } = require('typeorm');
const path = require('path');

const DEFAULT_TYPES = [
  { name: 'Temperature', description: 'Temperature sensors', icon: 'thermometer' },
  { name: 'Humidity', description: 'Humidity sensors', icon: 'droplet' },
  { name: 'Pressure', description: 'Pressure sensors', icon: 'gauge' },
  { name: 'Flow', description: 'Flow rate sensors', icon: 'waves' },
  { name: 'Level', description: 'Level sensors', icon: 'bar-chart-2' },
  { name: 'Voltage', description: 'Voltage sensors', icon: 'zap' },
  { name: 'Current', description: 'Current sensors', icon: 'activity' },
  { name: 'Power', description: 'Power sensors', icon: 'battery-charging' },
  { name: 'Energy', description: 'Energy meters', icon: 'battery' },
  { name: 'Vibration', description: 'Vibration sensors', icon: 'radio' },
  { name: 'Motion', description: 'Motion detectors', icon: 'move' },
  { name: 'Light', description: 'Light sensors', icon: 'sun' },
  { name: 'Sound', description: 'Sound level sensors', icon: 'volume-2' },
  { name: 'Gas', description: 'Gas sensors', icon: 'cloud' },
  { name: 'pH', description: 'pH sensors', icon: 'flask' },
  { name: 'Conductivity', description: 'Conductivity sensors', icon: 'zap' },
  { name: 'Counter', description: 'Counter/pulse sensors', icon: 'hash' },
  { name: 'Binary', description: 'Binary/digital sensors', icon: 'toggle-right' },
  { name: 'Other', description: 'Other sensor types', icon: 'more-horizontal' },
];

const DEFAULT_CATEGORIES = [
  { name: 'Environmental', description: 'Environmental monitoring', color: '#10b981' },
  { name: 'Industrial', description: 'Industrial automation', color: '#f59e0b' },
  { name: 'Energy', description: 'Energy monitoring', color: '#eab308' },
  { name: 'Water Quality', description: 'Water quality monitoring', color: '#06b6d4' },
  { name: 'HVAC', description: 'Heating, ventilation, and air conditioning', color: '#3b82f6' },
  { name: 'Safety', description: 'Safety and security', color: '#ef4444' },
  { name: 'Manufacturing', description: 'Manufacturing processes', color: '#8b5cf6' },
  { name: 'Agriculture', description: 'Agricultural monitoring', color: '#22c55e' },
  { name: 'Building Automation', description: 'Building management systems', color: '#6366f1' },
  { name: 'Transportation', description: 'Transportation and logistics', color: '#ec4899' },
  { name: 'Other', description: 'Other categories', color: '#64748b' },
];

async function seed() {
  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/iotproxy',
    // No entities needed - we're using raw SQL queries
    entities: [],
  });

  try {
    await dataSource.initialize();
    console.log('Database connected');

    // Get all organizations
    const orgs = await dataSource.query('SELECT id FROM organizations');
    console.log(`Found ${orgs.length} organizations`);

    for (const org of orgs) {
      const orgId = org.id;
      console.log(`\nSeeding data for organization ${orgId}...`);

      // Seed sensor types
      for (const type of DEFAULT_TYPES) {
        const existing = await dataSource.query(
          'SELECT id FROM sensor_types WHERE organization_id = $1 AND name = $2',
          [orgId, type.name]
        );

        if (existing.length === 0) {
          await dataSource.query(
            'INSERT INTO sensor_types (organization_id, name, description, icon, is_active) VALUES ($1, $2, $3, $4, $5)',
            [orgId, type.name, type.description, type.icon, true]
          );
          console.log(`  ✓ Created sensor type: ${type.name}`);
        } else {
          console.log(`  - Sensor type already exists: ${type.name}`);
        }
      }

      // Seed sensor categories
      for (const category of DEFAULT_CATEGORIES) {
        const existing = await dataSource.query(
          'SELECT id FROM sensor_categories WHERE organization_id = $1 AND name = $2',
          [orgId, category.name]
        );

        if (existing.length === 0) {
          await dataSource.query(
            'INSERT INTO sensor_categories (organization_id, name, description, color, is_active) VALUES ($1, $2, $3, $4, $5)',
            [orgId, category.name, category.description, category.color, true]
          );
          console.log(`  ✓ Created sensor category: ${category.name}`);
        } else {
          console.log(`  - Sensor category already exists: ${category.name}`);
        }
      }
    }

    console.log('\n✅ Seeding completed successfully!');
    await dataSource.destroy();
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    await dataSource.destroy();
    process.exit(1);
  }
}

seed();
