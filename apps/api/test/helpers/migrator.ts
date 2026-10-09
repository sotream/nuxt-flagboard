import { readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DataSource } from 'typeorm';
import type { MigrationInterface } from 'typeorm';
import { loadRootEnv } from '../../src/infrastructure/config/load-env.js';
import { buildBaseOptions } from '../../src/infrastructure/database/data-source-options.js';
import { toTestDatabaseUrl } from './test-database-url.js';

const MIGRATIONS_DIR = path.resolve(
  import.meta.dirname,
  '../../src/infrastructure/database/migrations',
);

/** Imports the migration classes from the TypeScript sources, in file name (= timestamp) order. */
async function loadMigrations(): Promise<(new () => MigrationInterface)[]> {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.ts'))
    .sort();
  const modules = await Promise.all(
    files.map((file) => import(pathToFileURL(path.join(MIGRATIONS_DIR, file)).href)),
  );
  return modules
    .flatMap((module) => Object.values<unknown>(module))
    .filter((value): value is new () => MigrationInterface => typeof value === 'function');
}

/** A connection to the e2e database as the migrator role, the only role allowed to change the schema. */
export async function connectAsMigrator(): Promise<DataSource> {
  loadRootEnv();
  const url = process.env.MIGRATOR_DATABASE_URL;
  if (!url) {
    throw new Error('MIGRATOR_DATABASE_URL is required for e2e tests');
  }
  const dataSource = new DataSource({
    ...buildBaseOptions(toTestDatabaseUrl(url)),
    migrations: await loadMigrations(),
  });
  return dataSource.initialize();
}
