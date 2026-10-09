import { createHash } from 'node:crypto';
import { startSession } from './helpers/api-session.js';
import type { ApiSession } from './helpers/api-session.js';

let s: ApiSession;
let projectKey: string;

beforeAll(async () => {
  s = await startSession();
});

beforeEach(async () => {
  ({ key: projectKey } = await s.newProject());
});

afterAll(async () => {
  await s.t.close();
});

const base = () => `/api/v1/projects/${projectKey}/keys`;
const createKey = (body: object, token = s.adminToken) =>
  s.t.http.post(base()).set(s.as(token)).send(body);
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const serverKey = (overrides: object = {}) => ({
  environment: 'dev',
  kind: 'server',
  name: 'CI',
  ...overrides,
});

describe('POST /projects/:key/keys', () => {
  it('creates a server key and returns the full key once', async () => {
    const response = await createKey(serverKey({ name: 'Backend' })).expect(201);

    expect(response.body.key).toMatch(/^fb_srv_[A-Za-z0-9_-]{43}$/);
    expect(response.body).toMatchObject({
      name: 'Backend',
      kind: 'server',
      environment: 'dev',
      revokedAt: null,
      createdByEmail: s.admin.email,
    });
    expect(response.body.prefix).toBe(response.body.key.slice(0, 11));
  });

  it('creates a client key with its own prefix', async () => {
    const response = await createKey(serverKey({ kind: 'client', environment: 'prod' })).expect(
      201,
    );
    expect(response.body.key).toMatch(/^fb_cli_/);
    expect(response.body.environment).toBe('prod');
  });

  it('stores only the SHA-256 of the key, never the key itself', async () => {
    const { body } = await createKey(serverKey()).expect(201);

    const [row] = await s.t.dataSource.query('SELECT * FROM api_keys WHERE id = $1', [body.id]);
    expect(row.key_hash).toBe(sha256(body.key));
    expect(JSON.stringify(row)).not.toContain(body.key);
  });

  it('never returns the key or its hash again', async () => {
    const { body } = await createKey(serverKey()).expect(201);

    const list = await s.t.http.get(base()).set(s.as(s.adminToken)).expect(200);
    const text = JSON.stringify(list.body);
    expect(text).not.toContain(body.key);
    expect(text).not.toContain(sha256(body.key));
    expect(list.body[0]).not.toHaveProperty('key');
    expect(list.body[0]).not.toHaveProperty('keyHash');
  });

  it('gives every key a different secret', async () => {
    const a = await createKey(serverKey()).expect(201);
    const b = await createKey(serverKey()).expect(201);
    expect(a.body.key).not.toBe(b.body.key);
  });

  it('audits the creation with the prefix only, and the audit log never contains the key', async () => {
    const { body } = await createKey(serverKey({ name: 'Audited' })).expect(201);

    const audit = await s.t.http
      .get(`/api/v1/projects/${projectKey}/audit`)
      .set(s.as(s.adminToken))
      .expect(200);
    const event = audit.body.items.find((e: { action: string }) => e.action === 'api_key.created');
    expect(event).toMatchObject({
      environmentKey: 'dev',
      after: { name: 'Audited', kind: 'server', prefix: body.prefix },
    });
    expect(JSON.stringify(audit.body)).not.toContain(body.key);
    expect(JSON.stringify(audit.body)).not.toContain(sha256(body.key));
  });

  it.each([
    ['an unknown environment', serverKey({ environment: 'qa' })],
    ['an unknown kind', serverKey({ kind: 'admin' })],
    ['an empty name', serverKey({ name: ' ' })],
    ['a name over 120 characters', serverKey({ name: 'n'.repeat(121) })],
    ['a missing kind', { environment: 'dev', name: 'x' }],
    ['an unknown field', serverKey({ keyHash: 'abc' })],
  ])('rejects %s', async (_label, body) => {
    await createKey(body).expect(400);
  });

  it('is forbidden for a viewer, unauthorised without a token and 404 for an unknown project', async () => {
    await createKey(serverKey(), s.viewerToken).expect(403);
    await s.t.http.post(base()).send(serverKey()).expect(401);
    await s.t.http
      .post('/api/v1/projects/no-such-project/keys')
      .set(s.as(s.adminToken))
      .send(serverKey())
      .expect(404);
  });
});

describe('GET /projects/:key/keys', () => {
  it('lists the keys of all environments, newest first, for a viewer too', async () => {
    await createKey(serverKey({ name: 'first' })).expect(201);
    await createKey(serverKey({ name: 'second', environment: 'staging', kind: 'client' })).expect(
      201,
    );

    const response = await s.t.http.get(base()).set(s.as(s.viewerToken)).expect(200);
    expect(response.body.map((k: { name: string }) => k.name)).toEqual(['second', 'first']);
    expect(response.body[0]).toMatchObject({ environment: 'staging', kind: 'client' });
  });

  it('does not list the keys of another project', async () => {
    await createKey(serverKey()).expect(201);
    const other = await s.newProject();

    const response = await s.t.http
      .get(`/api/v1/projects/${other.key}/keys`)
      .set(s.as(s.adminToken))
      .expect(200);
    expect(response.body).toEqual([]);
  });

  it('is unauthorised without a token', async () => {
    await s.t.http.get(base()).expect(401);
  });
});

describe('DELETE /projects/:key/keys/:id', () => {
  it('revokes a key, audits it and keeps it in the list as revoked', async () => {
    const { body } = await createKey(serverKey({ name: 'Doomed' })).expect(201);

    await s.t.http.delete(`${base()}/${body.id}`).set(s.as(s.adminToken)).expect(204);

    const list = await s.t.http.get(base()).set(s.as(s.adminToken)).expect(200);
    expect(list.body[0].revokedAt).not.toBeNull();
    const audit = await s.t.http
      .get(`/api/v1/projects/${projectKey}/audit`)
      .set(s.as(s.adminToken))
      .expect(200);
    const event = audit.body.items.find((e: { action: string }) => e.action === 'api_key.revoked');
    expect(event).toMatchObject({ before: { id: body.id, name: 'Doomed', prefix: body.prefix } });
    expect(JSON.stringify(audit.body)).not.toContain(body.key);
  });

  it('succeeds again without changing anything when the key is already revoked', async () => {
    const { body } = await createKey(serverKey()).expect(201);
    await s.t.http.delete(`${base()}/${body.id}`).set(s.as(s.adminToken)).expect(204);
    const [first] = await s.t.dataSource.query('SELECT revoked_at FROM api_keys WHERE id = $1', [
      body.id,
    ]);

    await s.t.http.delete(`${base()}/${body.id}`).set(s.as(s.adminToken)).expect(204);

    const [second] = await s.t.dataSource.query('SELECT revoked_at FROM api_keys WHERE id = $1', [
      body.id,
    ]);
    expect(second.revoked_at).toEqual(first.revoked_at);
    const audit = await s.t.http
      .get(`/api/v1/projects/${projectKey}/audit`)
      .set(s.as(s.adminToken))
      .expect(200);
    expect(
      audit.body.items.filter((e: { action: string }) => e.action === 'api_key.revoked'),
    ).toHaveLength(1);
  });

  it('cannot revoke a key of another project', async () => {
    const { body } = await createKey(serverKey()).expect(201);
    const other = await s.newProject();

    await s.t.http
      .delete(`/api/v1/projects/${other.key}/keys/${body.id}`)
      .set(s.as(s.adminToken))
      .expect(404);
    const [row] = await s.t.dataSource.query('SELECT revoked_at FROM api_keys WHERE id = $1', [
      body.id,
    ]);
    expect(row.revoked_at).toBeNull();
  });

  it('answers 404 for an unknown key and 400 for a malformed id', async () => {
    await s.t.http
      .delete(`${base()}/00000000-0000-4000-8000-000000000000`)
      .set(s.as(s.adminToken))
      .expect(404);
    await s.t.http.delete(`${base()}/not-a-uuid`).set(s.as(s.adminToken)).expect(400);
  });

  it('is forbidden for a viewer and unauthorised without a token', async () => {
    const { body } = await createKey(serverKey()).expect(201);
    await s.t.http.delete(`${base()}/${body.id}`).set(s.as(s.viewerToken)).expect(403);
    await s.t.http.delete(`${base()}/${body.id}`).expect(401);
  });
});
