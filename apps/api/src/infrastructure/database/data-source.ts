import { DataSource } from 'typeorm';
import { loadRootEnv } from '../config/load-env.js';
import { buildBaseOptions, ENTITIES_GLOB, MIGRATIONS_GLOB } from './data-source-options.js';

loadRootEnv();

/**
 * Data source for the TypeORM CLI. It connects as the migrator role, which owns the schema. The running API
 * never reads this variable: the application role cannot change the schema.
 */
const migratorUrl = process.env.MIGRATOR_DATABASE_URL;
if (!migratorUrl) {
  throw new Error('MIGRATOR_DATABASE_URL is required to run migrations');
}

export default new DataSource({
  ...buildBaseOptions(migratorUrl),
  entities: [ENTITIES_GLOB],
  migrations: [MIGRATIONS_GLOB],
});
