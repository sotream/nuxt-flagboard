import type { DataSource } from 'typeorm';
import { connectAsApp } from './helpers/app-role.js';
import { connectAsMigrator } from './helpers/migrator.js';

const APP_TABLES = [
  'api_keys',
  'audit_events',
  'environments',
  'flag_environments',
  'flags',
  'projects',
  'refresh_tokens',
  'users',
];

let migrator: DataSource;

beforeAll(async () => {
  migrator = await connectAsMigrator();
});

afterAll(async () => {
  await migrator.destroy();
});

const tables = async (): Promise<string[]> =>
  (
    await migrator.query<{ table_name: string }[]>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
    )
  ).map((row) => row.table_name);

const grantsOnAuditEvents = async (): Promise<string[]> =>
  (
    await migrator.query<{ privilege_type: string }[]>(
      `SELECT privilege_type FROM information_schema.role_table_grants
       WHERE grantee = 'flagboard_app' AND table_name = 'audit_events' ORDER BY privilege_type`,
    )
  ).map((row) => row.privilege_type);

// This test removes every table and puts them back, so it must leave the database exactly as it found it
// (other test files create their own data and do not depend on anything that exists before they start).
describe('migrations', () => {
  it('go up, down and up again, leaving the same schema and the same permissions', async () => {
    const before = await tables();
    expect(before).toEqual([...APP_TABLES, 'migrations'].sort());
    expect(await grantsOnAuditEvents()).toEqual(['INSERT', 'SELECT']);

    await migrator.undoLastMigration();
    expect(await tables()).toEqual(['migrations']);

    const reapplied = await migrator.runMigrations();
    expect(reapplied).toHaveLength(1);
    expect(await tables()).toEqual(before);
    expect(await grantsOnAuditEvents()).toEqual(['INSERT', 'SELECT']);
  });

  it('are idempotent: running them again when nothing is pending does nothing', async () => {
    expect(await migrator.runMigrations()).toEqual([]);
  });

  it('keep the audit log append-only for the application role after being re-applied', async () => {
    const app = await connectAsApp();
    try {
      await expect(app.query("UPDATE audit_events SET action = 'x'")).rejects.toThrow(
        'permission denied for table audit_events',
      );
      await expect(app.query('DELETE FROM audit_events')).rejects.toThrow(
        'permission denied for table audit_events',
      );
      await expect(app.query('CREATE TABLE sneaky (id int)')).rejects.toThrow('permission denied');
    } finally {
      await app.end();
    }
  });
});
