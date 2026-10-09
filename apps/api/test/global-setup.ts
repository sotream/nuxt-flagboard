import { connectAsMigrator } from './helpers/migrator.js';

/** Rebuilds the e2e database from the real migrations, as the migrator role, before any test runs. */
export default async function setup(): Promise<void> {
  const dataSource = await connectAsMigrator();
  try {
    // Drops tables only; the schema, its owner and the default privileges from init-roles.sql stay.
    await dataSource.dropDatabase();
    await dataSource.runMigrations();
  } finally {
    await dataSource.destroy();
  }
}
