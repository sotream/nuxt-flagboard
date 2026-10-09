import { unique } from './helpers/app-role.js';
import { startSession } from './helpers/api-session.js';
import type { ApiSession } from './helpers/api-session.js';

let s: ApiSession;
let projectKey: string;
let projectId: string;

beforeAll(async () => {
  s = await startSession();
});

beforeEach(async () => {
  ({ key: projectKey, id: projectId } = await s.newProject());
});

afterAll(async () => {
  await s.t.close();
});

const base = () => `/api/v1/projects/${projectKey}/flags`;
const createFlag = (body: object, token = s.adminToken) =>
  s.t.http.post(base()).set(s.as(token)).send(body);
const newKey = () => `flag-${unique()}`;
const auditOf = async (flagKey: string) =>
  (
    await s.t.http
      .get(`/api/v1/projects/${projectKey}/audit?flagKey=${flagKey}`)
      .set(s.as(s.adminToken))
      .expect(200)
  ).body.items as { action: string; before: unknown; after: Record<string, unknown> }[];

describe('POST /projects/:key/flags', () => {
  it('creates a boolean flag with true and false by default and one disabled state per environment', async () => {
    const key = newKey();
    const response = await createFlag({ key, name: 'New checkout', type: 'boolean' }).expect(201);

    expect(response.body).toMatchObject({
      key,
      name: 'New checkout',
      description: '',
      type: 'boolean',
      onValue: true,
      offValue: false,
      clientVisible: false,
      archivedAt: null,
    });
    expect(response.body.environments.map((e: { environment: string }) => e.environment)).toEqual([
      'dev',
      'staging',
      'prod',
    ]);
    for (const environment of response.body.environments) {
      expect(environment).toMatchObject({
        enabled: false,
        rolloutPercentage: 0,
        rules: [],
        killSwitch: false,
        killReason: null,
        revision: 1,
      });
    }
  });

  it('creates a string flag with its own values and client visibility', async () => {
    const response = await createFlag({
      key: newKey(),
      name: 'Button colour',
      type: 'string',
      onValue: 'blue',
      offValue: 'red',
      clientVisible: true,
    }).expect(201);

    expect(response.body).toMatchObject({
      type: 'string',
      onValue: 'blue',
      offValue: 'red',
      clientVisible: true,
    });
  });

  it('never returns the salt, and stores a different random salt per flag', async () => {
    const a = newKey();
    const b = newKey();
    const response = await createFlag({ key: a, name: 'A', type: 'boolean' }).expect(201);
    await createFlag({ key: b, name: 'B', type: 'boolean' }).expect(201);

    expect(JSON.stringify(response.body)).not.toContain('salt');
    const rows = await s.t.dataSource.query(
      'SELECT salt FROM flags WHERE project_id = $1 AND key = ANY($2)',
      [projectId, [a, b]],
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].salt).toMatch(/^[0-9a-f]{32}$/);
    expect(rows[0].salt).not.toBe(rows[1].salt);
  });

  it('records the creation in the audit log', async () => {
    const key = newKey();
    await createFlag({ key, name: 'Audited', type: 'boolean' }).expect(201);

    const events = await auditOf(key);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ action: 'flag.created', before: null });
    expect(events[0]!.after).toMatchObject({ key, name: 'Audited', type: 'boolean' });
    expect(JSON.stringify(events[0])).not.toContain('salt');
  });

  it('answers 409 for a duplicate key, even when the first flag is archived', async () => {
    const key = newKey();
    await createFlag({ key, name: 'First', type: 'boolean' }).expect(201);
    await createFlag({ key, name: 'Second', type: 'boolean' }).expect(409);

    await s.t.http
      .patch(`${base()}/${key}`)
      .set(s.as(s.adminToken))
      .send({ archived: true })
      .expect(200);
    await createFlag({ key, name: 'Third', type: 'boolean' }).expect(409);
  });

  it.each([
    ['an upper-case key', { key: 'Flag', name: 'X', type: 'boolean' }],
    ['a key with a space', { key: 'my flag', name: 'X', type: 'boolean' }],
    ['a key over 64 characters', { key: 'a'.repeat(65), name: 'X', type: 'boolean' }],
    ['an empty name', { key: 'valid', name: ' ', type: 'boolean' }],
    ['an unknown type', { key: 'valid', name: 'X', type: 'number' }],
    [
      'string values for a boolean flag',
      { key: 'valid', name: 'X', type: 'boolean', onValue: 'true', offValue: 'false' },
    ],
    ['a string flag without values', { key: 'valid', name: 'X', type: 'string' }],
    ['equal values', { key: 'valid', name: 'X', type: 'string', onValue: 'a', offValue: 'a' }],
    [
      'a salt sent by the client',
      { key: 'valid', name: 'X', type: 'boolean', salt: '0'.repeat(32) },
    ],
    [
      'a description over 1000 characters',
      { key: 'valid', name: 'X', type: 'boolean', description: 'd'.repeat(1001) },
    ],
  ])('rejects %s', async (_label, body) => {
    await createFlag(body).expect(400);
  });

  it('is forbidden for a viewer, unauthorised without a token and 404 for an unknown project', async () => {
    await createFlag({ key: newKey(), name: 'X', type: 'boolean' }, s.viewerToken).expect(403);
    await s.t.http.post(base()).send({ key: newKey(), name: 'X', type: 'boolean' }).expect(401);
    await s.t.http
      .post('/api/v1/projects/no-such-project/flags')
      .set(s.as(s.adminToken))
      .send({ key: newKey(), name: 'X', type: 'boolean' })
      .expect(404);
  });
});

describe('GET /projects/:key/flags', () => {
  it('lists flags by key for a viewer, without archived ones unless asked', async () => {
    const live = newKey();
    const gone = newKey();
    await createFlag({ key: live, name: 'Live', type: 'boolean' }).expect(201);
    await createFlag({ key: gone, name: 'Gone', type: 'boolean' }).expect(201);
    await s.t.http
      .patch(`${base()}/${gone}`)
      .set(s.as(s.adminToken))
      .send({ archived: true })
      .expect(200);

    const visible = await s.t.http.get(base()).set(s.as(s.viewerToken)).expect(200);
    expect(visible.body.map((f: { key: string }) => f.key)).toEqual([live]);
    const all = await s.t.http
      .get(`${base()}?includeArchived=true`)
      .set(s.as(s.viewerToken))
      .expect(200);
    expect(all.body.map((f: { key: string }) => f.key).sort()).toEqual([live, gone].sort());
  });

  it('searches the key and the name, ignoring case, and treats % literally', async () => {
    const token = unique();
    await createFlag({ key: `search-${token}`, name: 'Alpha', type: 'boolean' }).expect(201);
    await createFlag({
      key: newKey(),
      name: `Beta ${token.toUpperCase()}`,
      type: 'boolean',
    }).expect(201);
    await createFlag({ key: newKey(), name: 'Gamma', type: 'boolean' }).expect(201);

    const found = await s.t.http
      .get(`${base()}?search=${token}`)
      .set(s.as(s.adminToken))
      .expect(200);
    expect(found.body).toHaveLength(2);
    const literal = await s.t.http.get(`${base()}?search=%25`).set(s.as(s.adminToken)).expect(200);
    expect(literal.body).toEqual([]);
  });

  it('does not show the flags of another project', async () => {
    await createFlag({ key: newKey(), name: 'Mine', type: 'boolean' }).expect(201);
    const other = await s.newProject();

    const response = await s.t.http
      .get(`/api/v1/projects/${other.key}/flags`)
      .set(s.as(s.adminToken))
      .expect(200);
    expect(response.body).toEqual([]);
  });

  it('returns one flag, 404 for an unknown one and 401 without a token', async () => {
    const key = newKey();
    await createFlag({ key, name: 'One', type: 'boolean' }).expect(201);

    await s.t.http.get(`${base()}/${key}`).set(s.as(s.viewerToken)).expect(200);
    await s.t.http.get(`${base()}/nope`).set(s.as(s.adminToken)).expect(404);
    await s.t.http.get(base()).expect(401);
  });
});

describe('PATCH /projects/:key/flags/:flag', () => {
  const patch = (key: string, body: object, token = s.adminToken) =>
    s.t.http.patch(`${base()}/${key}`).set(s.as(token)).send(body);

  it('changes metadata and audits only what changed, with the old and the new value', async () => {
    const key = newKey();
    await createFlag({ key, name: 'Old name', description: 'same', type: 'boolean' }).expect(201);

    const response = await patch(key, {
      name: 'New name',
      description: 'same',
      clientVisible: true,
    }).expect(200);

    expect(response.body).toMatchObject({
      name: 'New name',
      description: 'same',
      clientVisible: true,
    });
    const updated = (await auditOf(key)).find((e) => e.action === 'flag.updated')!;
    expect(updated.before).toEqual({ name: 'Old name', clientVisible: false });
    expect(updated.after).toEqual({ name: 'New name', clientVisible: true });
  });

  it('does nothing, and audits nothing, when nothing changes', async () => {
    const key = newKey();
    await createFlag({ key, name: 'Same', type: 'boolean' }).expect(201);

    await patch(key, { name: 'Same' }).expect(200);
    expect((await auditOf(key)).map((e) => e.action)).toEqual(['flag.created']);
  });

  it.each([
    ['the type', { type: 'string' }],
    ['the key', { key: 'other' }],
    ['the values', { onValue: 'x' }],
    ['the salt', { salt: '0'.repeat(32) }],
    ['an empty name', { name: '' }],
  ])('refuses to change %s', async (_label, body) => {
    const key = newKey();
    await createFlag({ key, name: 'Fixed', type: 'boolean' }).expect(201);
    await patch(key, body).expect(400);
  });

  it('archives and restores, auditing both, and keeps an archived flag read-only', async () => {
    const key = newKey();
    await createFlag({ key, name: 'Cycle', type: 'boolean' }).expect(201);

    const archived = await patch(key, { archived: true }).expect(200);
    expect(archived.body.archivedAt).not.toBeNull();
    await patch(key, { name: 'Renamed while archived' }).expect(409);

    const restored = await patch(key, { archived: false }).expect(200);
    expect(restored.body.archivedAt).toBeNull();
    const archiveEvents = (await auditOf(key)).filter((e) => e.action === 'flag.archived');
    expect(archiveEvents.map((e) => e.after)).toEqual([{ archived: false }, { archived: true }]);
  });

  it('is forbidden for a viewer and 404 for an unknown flag', async () => {
    const key = newKey();
    await createFlag({ key, name: 'X', type: 'boolean' }).expect(201);
    await patch(key, { name: 'Y' }, s.viewerToken).expect(403);
    await patch('nope', { name: 'Y' }).expect(404);
  });
});
