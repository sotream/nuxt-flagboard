import pg from 'pg';
import { loadRootEnv } from '../../src/infrastructure/config/load-env.js';
import { toTestDatabaseUrl } from './test-database-url.js';

/** Arbitrary constant; every e2e run on a database takes the same lock. */
export const E2E_RUN_LOCK_KEY = 80_414_001;

/** A dedicated connection to the e2e database, so the lock lives as long as the run (and dies with it). */
export function connectForRunLock(): pg.Client {
  loadRootEnv();
  const url = process.env.MIGRATOR_DATABASE_URL;
  if (!url) {
    throw new Error('MIGRATOR_DATABASE_URL is required for e2e tests');
  }
  return new pg.Client({ connectionString: toTestDatabaseUrl(url) });
}

/**
 * Waits until no other e2e run uses this database, then holds the advisory lock until released.
 * The tests share one database that global setup rebuilds, so two overlapping runs would drop each
 * other's tables mid-test. A crashed run frees the lock when its connection closes.
 */
export async function acquireRunLock(): Promise<() => Promise<void>> {
  const client = connectForRunLock();
  await client.connect();
  await client.query('SELECT pg_advisory_lock($1)', [E2E_RUN_LOCK_KEY]);
  return async () => {
    await client.end();
  };
}
