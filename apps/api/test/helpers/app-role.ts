import { randomBytes } from 'node:crypto';
import pg from 'pg';

/** A raw connection as the application role (what the API uses). */
export async function connectAsApp(): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  return client;
}

/** A short random suffix so tests can share one database without clashing on unique keys. */
export const unique = (): string => randomBytes(4).toString('hex');
