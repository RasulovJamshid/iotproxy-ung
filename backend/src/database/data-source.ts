import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

/**
 * TypeORM CLI data source — used by:
 *   npx typeorm migration:generate
 *   npx typeorm migration:run
 *   npx typeorm migration:revert
 *
 * Not used at runtime (DatabaseModule.forRootAsync handles that).
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [path.join(__dirname, '../**/*.entity{.ts,.js}')],
  migrations: [path.join(__dirname, './migrations/*{.ts,.js}')],
  synchronize: false,
  logging: true,
});
