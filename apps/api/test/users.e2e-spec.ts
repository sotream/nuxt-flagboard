import { Role } from '../src/common/enums/role.enum.js';
import { unique } from './helpers/app-role.js';
import { createTestApp, createUser, WEB_ORIGIN } from './helpers/test-app.js';
import type { TestApp, TestUser } from './helpers/test-app.js';

let t: TestApp;
let adminToken: string;
let viewerToken: string;

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
  adminToken = await signIn(await createUser(t.dataSource, Role.Admin));
  viewerToken = await signIn(await createUser(t.dataSource, Role.Viewer));
});

afterAll(async () => {
  await t.close();
});

const create = (token: string | undefined, body: object) => {
  const request = t.http.post('/api/v1/users').send(body);
  return token ? request.set('Authorization', `Bearer ${token}`) : request;
};

const newEmail = () => `new-${unique()}@example.com`;

describe('POST /api/v1/users', () => {
  it('lets an admin create a viewer who can then sign in', async () => {
    const email = newEmail();
    const response = await create(adminToken, { email, password: 'a-long-password-123' }).expect(
      201,
    );

    expect(response.body).toMatchObject({ email, role: 'viewer' });
    expect(response.body).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(response.body)).not.toContain('a-long-password-123');
    await t.http
      .post('/api/v1/auth/login')
      .set('Origin', WEB_ORIGIN)
      .send({ email, password: 'a-long-password-123' })
      .expect(200);
  });

  it('stores a hash, never the password', async () => {
    const email = newEmail();
    await create(adminToken, { email, password: 'a-long-password-123' }).expect(201);

    const [row] = await t.dataSource.query('SELECT password_hash FROM users WHERE email = $1', [
      email,
    ]);
    expect(row.password_hash).toMatch(/^\$2[aby]\$/);
    expect(row.password_hash).not.toContain('a-long-password-123');
  });

  it('stores the email in lower case and rejects a duplicate in any case', async () => {
    const email = newEmail();
    await create(adminToken, {
      email: email.toUpperCase(),
      password: 'a-long-password-123',
    }).expect(201);

    const [row] = await t.dataSource.query('SELECT email FROM users WHERE email = $1', [email]);
    expect(row.email).toBe(email);
    await create(adminToken, { email, password: 'a-long-password-123' }).expect(409);
  });

  it('is forbidden for a viewer and unauthorised without a token', async () => {
    const body = { email: newEmail(), password: 'a-long-password-123' };
    await create(viewerToken, body).expect(403);
    await create(undefined, body).expect(401);
  });

  it('never accepts a role from the request body', async () => {
    await create(adminToken, {
      email: newEmail(),
      password: 'a-long-password-123',
      role: 'admin',
    }).expect(400);
  });

  it.each([
    ['a password shorter than 12 characters', { password: 'short-pw-1' }],
    ['a password longer than 72 bytes', { password: 'a'.repeat(73) }],
    ['a malformed email', { email: 'not-an-email', password: 'a-long-password-123' }],
    [
      'an email over 254 characters',
      { email: `${'a'.repeat(250)}@example.com`, password: 'a-long-password-123' },
    ],
  ])('rejects %s', async (_label, overrides) => {
    const valid: Record<string, string> = { email: newEmail(), password: 'a-long-password-123' };
    await create(adminToken, { ...valid, ...overrides }).expect(400);
  });
});
