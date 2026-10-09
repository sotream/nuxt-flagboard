import { Role } from '../src/common/enums/role.enum.js';
import { unique } from './helpers/app-role.js';
import { createTestApp, createUser, WEB_ORIGIN } from './helpers/test-app.js';
import type { TestApp, TestUser } from './helpers/test-app.js';

let t: TestApp;
let adminToken: string;
let viewerToken: string;
let adminEmail: string;

async function signIn(user: TestUser): Promise<string> {
  const response = await t.http
    .post('/api/v1/auth/login')
    .set('Origin', WEB_ORIGIN)
    .send({ email: user.email, password: user.password })
    .expect(200);
  return response.body.accessToken;
}

beforeAll(async () => {
  t = await createTestApp({ env: { LOGIN_RATE_LIMIT_PER_MINUTE: '1000' } });
  const admin = await createUser(t.dataSource, Role.Admin);
  adminEmail = admin.email;
  adminToken = await signIn(admin);
  viewerToken = await signIn(await createUser(t.dataSource, Role.Viewer));
});

afterAll(async () => {
  await t.close();
});

const as = (token: string) => ({ Authorization: `Bearer ${token}` });
const createProject = (body: object, token = adminToken) =>
  t.http.post('/api/v1/projects').set(as(token)).send(body);
const newKey = () => `proj-${unique()}`;

describe('POST /api/v1/projects', () => {
  it('creates a project with the three environments in order', async () => {
    const key = newKey();
    const response = await createProject({ key, name: 'Checkout' }).expect(201);

    expect(response.body).toMatchObject({ key, name: 'Checkout' });
    expect(response.body.environments.map((e: { key: string }) => e.key)).toEqual([
      'dev',
      'staging',
      'prod',
    ]);
  });

  it('records who created the project in the audit log', async () => {
    const key = newKey();
    await createProject({ key, name: 'Audited' }).expect(201);

    const audit = await t.http.get(`/api/v1/projects/${key}/audit`).set(as(adminToken)).expect(200);
    expect(audit.body.items).toHaveLength(1);
    expect(audit.body.items[0]).toMatchObject({
      action: 'project.created',
      actorEmail: adminEmail,
      before: null,
      after: { key, name: 'Audited' },
    });
  });

  it('does not audit a creation that was rejected', async () => {
    const key = newKey();
    await createProject({ key, name: 'First' }).expect(201);
    await createProject({ key, name: 'Second' }).expect(409);

    const audit = await t.http.get(`/api/v1/projects/${key}/audit`).set(as(adminToken)).expect(200);
    expect(audit.body.items).toHaveLength(1);
  });

  it('trims the name', async () => {
    const response = await createProject({ key: newKey(), name: '  Padded  ' }).expect(201);
    expect(response.body.name).toBe('Padded');
  });

  it('answers 409 for a duplicate key and leaves no half-created project', async () => {
    const key = newKey();
    await createProject({ key, name: 'First' }).expect(201);
    await createProject({ key, name: 'Second' }).expect(409);

    const rows = await t.dataSource.query(
      'SELECT count(*)::int AS n FROM environments e JOIN projects p ON p.id = e.project_id WHERE p.key = $1',
      [key],
    );
    expect(rows[0].n).toBe(3);
  });

  it('is forbidden for a viewer and unauthorised without a token', async () => {
    await createProject({ key: newKey(), name: 'X' }, viewerToken).expect(403);
    await t.http.post('/api/v1/projects').send({ key: newKey(), name: 'X' }).expect(401);
  });

  it.each([
    ['an upper-case key', { key: 'Checkout', name: 'X' }],
    ['a key with a space', { key: 'my project', name: 'X' }],
    ['a key with a leading dash', { key: '-checkout', name: 'X' }],
    ['a key with a double dash', { key: 'check--out', name: 'X' }],
    ['a key over 64 characters', { key: 'a'.repeat(65), name: 'X' }],
    ['an empty name', { key: 'valid-key', name: '   ' }],
    ['a name over 120 characters', { key: 'valid-key', name: 'n'.repeat(121) }],
    ['an unknown field', { key: 'valid-key', name: 'X', id: 'abc' }],
  ])('rejects %s', async (_label, body) => {
    await createProject(body).expect(400);
  });
});

describe('GET /api/v1/projects', () => {
  it('lets a viewer list and open projects', async () => {
    const key = newKey();
    await createProject({ key, name: 'Visible to viewers' }).expect(201);

    const list = await t.http.get('/api/v1/projects').set(as(viewerToken)).expect(200);
    expect(list.body.map((p: { key: string }) => p.key)).toContain(key);
    const one = await t.http.get(`/api/v1/projects/${key}`).set(as(viewerToken)).expect(200);
    expect(one.body.environments).toHaveLength(3);
  });

  it('searches the key and the name, ignoring case', async () => {
    const token = unique();
    await createProject({ key: `search-${token}`, name: 'Billing Portal' }).expect(201);
    await createProject({ key: newKey(), name: `Other ${token.toUpperCase()}` }).expect(201);
    await createProject({ key: newKey(), name: 'Unrelated' }).expect(201);

    const found = await t.http
      .get(`/api/v1/projects?search=${token}`)
      .set(as(adminToken))
      .expect(200);
    expect(found.body).toHaveLength(2);
  });

  it('treats % and _ in the search literally', async () => {
    await createProject({ key: newKey(), name: 'Plain' }).expect(201);

    const found = await t.http.get('/api/v1/projects?search=%25').set(as(adminToken)).expect(200);
    expect(found.body).toEqual([]);
  });

  it('answers 404 for an unknown project and 401 without a token', async () => {
    await t.http.get('/api/v1/projects/does-not-exist').set(as(adminToken)).expect(404);
    await t.http.get('/api/v1/projects').expect(401);
  });
});
