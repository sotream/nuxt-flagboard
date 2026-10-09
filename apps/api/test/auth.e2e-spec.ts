import { JwtService } from '@nestjs/jwt';
import { Role } from '../src/common/enums/role.enum.js';
import { sha256 } from '../src/common/utils/hash.js';
import { createTestApp, createUser, refreshCookieOf, WEB_ORIGIN } from './helpers/test-app.js';
import type { TestApp, TestUser } from './helpers/test-app.js';

let t: TestApp;
let admin: TestUser;

beforeAll(async () => {
  // Plenty of sign-ins happen in this file; the rate limit has its own spec.
  t = await createTestApp({ env: { LOGIN_RATE_LIMIT_PER_MINUTE: '1000' } });
  admin = await createUser(t.dataSource, Role.Admin);
});

afterAll(async () => {
  await t.close();
});

const login = (
  body: object = { email: admin.email, password: admin.password },
  origin = WEB_ORIGIN,
) => t.http.post('/api/v1/auth/login').set('Origin', origin).send(body);

const refresh = (cookie: string, origin: string | null = WEB_ORIGIN) => {
  const req = t.http.post('/api/v1/auth/refresh').set('Cookie', cookie);
  return origin ? req.set('Origin', origin) : req;
};

describe('POST /api/v1/auth/login', () => {
  it('returns an access token and the user, and sets the refresh token as a cookie only', async () => {
    const response = await login().expect(200);

    expect(response.body).toMatchObject({
      expiresIn: 900,
      user: { id: admin.id, email: admin.email, role: 'admin' },
    });
    expect(JSON.stringify(response.body)).not.toContain('refresh');
    const claims = new JwtService().decode<{ sub: string; role: string }>(
      response.body.accessToken,
    );
    expect(claims).toMatchObject({ sub: admin.id, role: 'admin' });
    expect(refreshCookieOf(response)).toBeDefined();
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('sets the refresh cookie as httpOnly, SameSite=Lax and scoped to the auth path', async () => {
    const response = await login().expect(200);
    const cookie = (response.headers['set-cookie'] as unknown as string[])[0]!;

    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/api/v1/auth');
    expect(cookie).not.toContain('Secure'); // only in production, see auth.constants.spec.ts
  });

  it('stores only a hash of the refresh token', async () => {
    const response = await login().expect(200);
    const raw = refreshCookieOf(response)!.split('=')[1]!;

    const rows = await t.dataSource.query(
      'SELECT token_hash FROM refresh_tokens WHERE token_hash = $1',
      [sha256(raw)],
    );
    const leaked = await t.dataSource.query('SELECT 1 FROM refresh_tokens WHERE token_hash = $1', [
      raw,
    ]);
    expect(rows).toHaveLength(1);
    expect(leaked).toHaveLength(0);
  });

  it('rejects a wrong password and an unknown email with the same message', async () => {
    const wrongPassword = await login({
      email: admin.email,
      password: 'wrong-password-123',
    }).expect(401);
    const unknownEmail = await login({
      email: 'nobody@example.com',
      password: 'wrong-password-123',
    }).expect(401);

    expect(wrongPassword.body.message).toBe('Invalid email or password');
    expect(unknownEmail.body.message).toBe(wrongPassword.body.message);
    expect(refreshCookieOf(wrongPassword)).toBeUndefined();
  });

  it('compares the email case-insensitively', async () => {
    await login({ email: admin.email.toUpperCase(), password: admin.password }).expect(200);
  });

  it('rejects a missing Origin header', async () => {
    await t.http
      .post('/api/v1/auth/login')
      .send({ email: admin.email, password: admin.password })
      .expect(403);
  });

  it('rejects an Origin that is not the web app', async () => {
    await login(undefined, 'https://evil.example.com').expect(403);
  });

  it('rejects a password longer than 72 bytes instead of silently truncating it', async () => {
    await login({ email: admin.email, password: 'a'.repeat(73) }).expect(400);
  });

  it('rejects unknown fields and malformed emails', async () => {
    await login({ email: admin.email, password: admin.password, role: 'admin' }).expect(400);
    await login({ email: 'not-an-email', password: admin.password }).expect(400);
  });
});

describe('POST /api/v1/auth/refresh', () => {
  async function signIn(): Promise<string> {
    return refreshCookieOf(await login().expect(200))!;
  }

  it('rotates the refresh token and returns a new access token', async () => {
    const first = await signIn();
    const response = await refresh(first).expect(200);

    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.user).toMatchObject({ id: admin.id, role: 'admin' });
    const second = refreshCookieOf(response)!;
    expect(second).not.toBe(first);
    await refresh(second).expect(200);
  });

  it('revokes the whole family when a rotated token is replayed', async () => {
    const first = await signIn();
    const second = refreshCookieOf(await refresh(first).expect(200))!;

    await refresh(first).expect(401); // replay of the old token
    await refresh(second).expect(401); // the legitimate holder is signed out too
  });

  it('lets only one of many concurrent refreshes with the same token succeed', async () => {
    const cookie = await signIn();
    // Open the pool's connections first. With a cold pool the first request finishes before the others have
    // connected, the requests never overlap and the test could not catch a non-atomic revoke.
    await Promise.all(Array.from({ length: 8 }, () => t.dataSource.query('SELECT pg_sleep(0.1)')));
    const responses = await Promise.all(Array.from({ length: 8 }, () => refresh(cookie)));

    const winners = responses.filter((r) => r.status === 200);
    expect(winners).toHaveLength(1);
    expect(responses.filter((r) => r.status === 401)).toHaveLength(7);
    // The race counts as reuse, so the family is revoked: even the winner's new token stops working.
    await refresh(refreshCookieOf(winners[0]!)!).expect(401);
  });

  it('rejects a missing, malformed or unknown token', async () => {
    await t.http.post('/api/v1/auth/refresh').set('Origin', WEB_ORIGIN).expect(401);
    await refresh('flagboard_refresh=not-a-real-token').expect(401);
  });

  it('rejects an expired token', async () => {
    const cookie = await signIn();
    const raw = cookie.split('=')[1]!;
    await t.dataSource.query(
      "UPDATE refresh_tokens SET expires_at = now() - interval '1 minute' WHERE token_hash = $1",
      [sha256(raw)],
    );

    await refresh(cookie).expect(401);
  });

  it('rejects a missing or foreign Origin', async () => {
    const cookie = await signIn();
    await refresh(cookie, null).expect(403);
    await refresh(cookie, 'https://evil.example.com').expect(403);
    await refresh(cookie).expect(200); // the rejected attempts did not consume the token
  });

  it('clears the cookie when the token is rejected', async () => {
    const response = await refresh('flagboard_refresh=not-a-real-token').expect(401);
    const cleared = (response.headers['set-cookie'] as unknown as string[])?.[0] ?? '';
    expect(cleared).toContain('flagboard_refresh=;');
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('revokes the session so the refresh token stops working', async () => {
    const cookie = refreshCookieOf(await login().expect(200))!;

    await t.http
      .post('/api/v1/auth/logout')
      .set('Origin', WEB_ORIGIN)
      .set('Cookie', cookie)
      .expect(204);
    await refresh(cookie).expect(401);
  });

  it('succeeds without a cookie (idempotent)', async () => {
    await t.http.post('/api/v1/auth/logout').set('Origin', WEB_ORIGIN).expect(204);
  });

  it('rejects a missing Origin', async () => {
    await t.http.post('/api/v1/auth/logout').expect(403);
  });
});
