import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class CreateSensorTypesAndCategories1713334900000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create sensor_types table
    await queryRunner.createTable(
      new Table({
        name: 'sensor_types',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'organization_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'name',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'icon',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'now()',
          },
          {
            name: 'deleted_at',
            type: 'timestamptz',
            isNullable: true,
          },
        ],
        uniques: [
          {
            name: 'UQ_sensor_types_org_name',
            columnNames: ['organization_id', 'name'],
          },
        ],
      }),
      true,
    );

    // Create sensor_categories table
    await queryRunner.createTable(
      new Table({
        name: 'sensor_categories',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'organization_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'name',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'color',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'now()',
          },
          {
            name: 'deleted_at',
            type: 'timestamptz',
            isNullable: true,
          },
        ],
        uniques: [
          {
            name: 'UQ_sensor_categories_org_name',
            columnNames: ['organization_id', 'name'],
          },
        ],
      }),
      true,
    );

    // Add type_id and category_id columns to sensors table
    await queryRunner.query(`
      ALTER TABLE sensors
      ADD COLUMN type_id uuid,
      ADD COLUMN category_id uuid
    `);

    // Add foreign keys
    await queryRunner.createForeignKey(
      'sensors',
      new TableForeignKey({
        columnNames: ['type_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'sensor_types',
        onDelete: 'SET NULL',
      }),
    );

    await queryRunner.createForeignKey(
      'sensors',
      new TableForeignKey({
        columnNames: ['category_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'sensor_categories',
        onDelete: 'SET NULL',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign keys
    const sensorsTable = await queryRunner.getTable('sensors');
    const typeFk = sensorsTable?.foreignKeys.find((fk) => fk.columnNames.indexOf('type_id') !== -1);
    const categoryFk = sensorsTable?.foreignKeys.find((fk) => fk.columnNames.indexOf('category_id') !== -1);

    if (typeFk) {
      await queryRunner.dropForeignKey('sensors', typeFk);
    }
    if (categoryFk) {
      await queryRunner.dropForeignKey('sensors', categoryFk);
    }

    // Drop columns from sensors
    await queryRunner.query(`
      ALTER TABLE sensors
      DROP COLUMN IF EXISTS type_id,
      DROP COLUMN IF EXISTS category_id
    `);

    // Drop tables
    await queryRunner.dropTable('sensor_categories');
    await queryRunner.dropTable('sensor_types');
  }
}
