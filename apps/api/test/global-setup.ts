import { readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DataSource } from 'typeorm';
import type { MigrationInterface } from 'typeorm';
import { buildBaseOptions } from '../src/infrastructure/database/data-source-options.js';
import { loadRootEnv } from '../src/infrastructure/config/load-env.js';
import { toTestDatabaseUrl } from './helpers/test-database-url.js';

const MIGRATIONS_DIR = path.resolve(
  import.meta.dirname,
  '../src/infrastructure/database/migrations',
);

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

/** Rebuilds the e2e database from the real migrations, as the migrator role, before any test runs. */
export default async function setup(): Promise<void> {
  loadRootEnv();
  const url = process.env.MIGRATOR_DATABASE_URL;
  if (!url) {
    throw new Error('MIGRATOR_DATABASE_URL is required for e2e tests');
  }
  const dataSource = new DataSource({
    ...buildBaseOptions(toTestDatabaseUrl(url)),
    migrations: await loadMigrations(),
  });
  await dataSource.initialize();
  try {
    // Drops tables only; the schema, its owner and the default privileges from init-roles.sql stay.
    await dataSource.dropDatabase();
    await dataSource.runMigrations();
  } finally {
    await dataSource.destroy();
  }
}
