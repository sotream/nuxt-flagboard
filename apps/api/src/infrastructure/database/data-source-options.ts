import { join } from 'node:path';
import type { DataSourceOptions } from 'typeorm';

export const ENTITIES_GLOB = join(import.meta.dirname, '../../modules/**/entities/*.entity.js');
export const MIGRATIONS_GLOB = join(import.meta.dirname, 'migrations/*.js');

/**
 * Connection settings shared by the running app and the migration CLI. The schema changes through
 * migrations only: never `synchronize`, and no `migrationsRun`, so migrating is its own deploy step.
 */
export function buildBaseOptions(url: string): DataSourceOptions {
  return {
    type: 'postgres',
    url,
    synchronize: false,
    // gen_random_uuid() is built into Postgres 13+, so no extension (and no superuser) is needed.
    uuidExtension: 'pgcrypto',
    installExtensions: false,
  };
}
