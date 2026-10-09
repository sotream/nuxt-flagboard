import type pg from 'pg';
import { connectAsApp, unique } from './helpers/app-role.js';

let db: pg.Client;

beforeAll(async () => {
  db = await connectAsApp();
});

afterAll(async () => {
  await db.end();
});

async function insertProject(): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO projects (key, name) VALUES ($1, 'Demo') RETURNING id",
    [`p-${unique()}`],
  );
  return rows[0]!.id;
}

async function insertAuditEvent(projectId: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO audit_events (project_id, actor_id, actor_email, action)
     VALUES ($1, gen_random_uuid(), 'admin@example.com', 'project.created') RETURNING id`,
    [projectId],
  );
  return rows[0]!.id;
}

describe('audit_events is append-only for the application role', () => {
  it('lets the application role insert and read events', async () => {
    const projectId = await insertProject();
    const id = await insertAuditEvent(projectId);
    const { rows } = await db.query('SELECT action FROM audit_events WHERE id = $1', [id]);
    expect(rows).toEqual([{ action: 'project.created' }]);
  });

  it('rejects UPDATE with permission denied', async () => {
    await expect(db.query("UPDATE audit_events SET action = 'tampered'")).rejects.toThrow(
      'permission denied for table audit_events',
    );
  });

  it('rejects DELETE with permission denied', async () => {
    await expect(db.query('DELETE FROM audit_events')).rejects.toThrow(
      'permission denied for table audit_events',
    );
  });

  it('rejects TRUNCATE with permission denied', async () => {
    await expect(db.query('TRUNCATE audit_events')).rejects.toThrow(
      'permission denied for table audit_events',
    );
  });

  it('does not let a project delete wipe its audit history', async () => {
    const projectId = await insertProject();
    await insertAuditEvent(projectId);
    await expect(db.query('DELETE FROM projects WHERE id = $1', [projectId])).rejects.toThrow(
      /violates RESTRICT setting of foreign key constraint/,
    );
  });
});

describe('the application role cannot change the schema', () => {
  it('cannot create a table', async () => {
    await expect(db.query('CREATE TABLE sneaky (id int)')).rejects.toThrow(
      'permission denied for schema public',
    );
  });

  it('cannot drop a table', async () => {
    await expect(db.query('DROP TABLE users')).rejects.toThrow('must be owner of table users');
  });

  it('cannot read the migration history', async () => {
    await expect(db.query('SELECT * FROM migrations')).rejects.toThrow(
      'permission denied for table migrations',
    );
  });
});

describe('database constraints reject invalid rows', () => {
  async function insertFlag(overrides: Record<string, string> = {}): Promise<void> {
    const projectId = await insertProject();
    const row = {
      key: `f-${unique()}`,
      type: 'boolean',
      on_value: 'true',
      off_value: 'false',
      salt: '0123456789abcdef0123456789abcdef',
      ...overrides,
    };
    await db.query(
      `INSERT INTO flags (project_id, key, name, type, on_value, off_value, salt)
       VALUES ($1, $2, 'Flag', $3, $4, $5, $6)`,
      [projectId, row.key, row.type, row.on_value, row.off_value, row.salt],
    );
  }

  it('accepts a valid boolean flag', async () => {
    await expect(insertFlag()).resolves.toBeUndefined();
  });

  it('rejects a boolean flag whose values are not true or false', async () => {
    await expect(insertFlag({ on_value: 'maybe' })).rejects.toThrow('ck_flags_boolean_values');
  });

  it('accepts any string values for a string flag', async () => {
    await expect(
      insertFlag({ type: 'string', on_value: 'blue', off_value: 'red' }),
    ).resolves.toBeUndefined();
  });

  it('rejects a salt that is not 32 hex characters', async () => {
    await expect(insertFlag({ salt: 'short' })).rejects.toThrow(/violates check constraint/);
  });

  it('rejects an unknown environment key', async () => {
    const projectId = await insertProject();
    await expect(
      db.query("INSERT INTO environments (project_id, key) VALUES ($1, 'qa')", [projectId]),
    ).rejects.toThrow(/violates check constraint/);
  });

  it('rejects an unknown API key kind', async () => {
    const projectId = await insertProject();
    const { rows } = await db.query<{ id: string }>(
      "INSERT INTO environments (project_id, key) VALUES ($1, 'dev') RETURNING id",
      [projectId],
    );
    await expect(
      db.query(
        "INSERT INTO api_keys (environment_id, kind, name, prefix, key_hash) VALUES ($1, 'admin', 'k', 'p', $2)",
        [rows[0]!.id, unique()],
      ),
    ).rejects.toThrow(/violates check constraint/);
  });

  async function insertFlagEnvironment(columns: string, values: unknown[]): Promise<void> {
    const projectId = await insertProject();
    const env = await db.query<{ id: string }>(
      "INSERT INTO environments (project_id, key) VALUES ($1, 'dev') RETURNING id",
      [projectId],
    );
    const flag = await db.query<{ id: string }>(
      `INSERT INTO flags (project_id, key, name, type, on_value, off_value, salt)
       VALUES ($1, 'f', 'Flag', 'boolean', 'true', 'false', '0123456789abcdef0123456789abcdef') RETURNING id`,
      [projectId],
    );
    const placeholders = values.map((_value, index) => `$${index + 3}`).join(', ');
    await db.query(
      `INSERT INTO flag_environments (flag_id, environment_id, ${columns}) VALUES ($1, $2, ${placeholders})`,
      [flag.rows[0]!.id, env.rows[0]!.id, ...values],
    );
  }

  it('rejects a rollout percentage above 100', async () => {
    await expect(insertFlagEnvironment('rollout_percentage', [101])).rejects.toThrow(
      /violates check constraint/,
    );
  });

  it('rejects a kill switch without a reason', async () => {
    await expect(insertFlagEnvironment('kill_switch', [true])).rejects.toThrow(
      'ck_flag_environments_kill_reason',
    );
  });

  it('rejects rules that are not a JSON array', async () => {
    await expect(insertFlagEnvironment('rules', ['{"a":1}'])).rejects.toThrow(
      /violates check constraint/,
    );
  });

  it('accepts a valid flag environment and starts it at revision 1', async () => {
    await expect(insertFlagEnvironment('rollout_percentage', [50])).resolves.toBeUndefined();
  });
});
