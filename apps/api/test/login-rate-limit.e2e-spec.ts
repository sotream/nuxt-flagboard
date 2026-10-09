import { Role } from '../src/common/enums/role.enum.js';
import { createTestApp, createUser, WEB_ORIGIN } from './helpers/test-app.js';
import type { TestApp } from './helpers/test-app.js';

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp({
    env: { LOGIN_RATE_LIMIT_PER_MINUTE: '3', SESSION_RATE_LIMIT_PER_MINUTE: '2' },
  });
});

afterAll(async () => {
  await t.close();
});

describe('sign-in rate limit', () => {
  it('answers 429 with Retry-After once the limit is used up, even for a correct password', async () => {
    const user = await createUser(t.dataSource, Role.Viewer);
    const attempt = () =>
      t.http
        .post('/api/v1/auth/login')
        .set('Origin', WEB_ORIGIN)
        .send({ email: user.email, password: 'wrong-password-123' });

    for (let i = 0; i < 3; i++) {
      await attempt().expect(401);
    }
    const blocked = await attempt().expect(429);
    expect(blocked.headers['retry-after']).toBeDefined();

    await t.http
      .post('/api/v1/auth/login')
      .set('Origin', WEB_ORIGIN)
      .send({ email: user.email, password: user.password })
      .expect(429);
  });

  it.each(['refresh', 'logout'])('limits POST /auth/%s per client IP too', async (route) => {
    const call = () => t.http.post(`/api/v1/auth/${route}`).set('Origin', WEB_ORIGIN);

    await call();
    await call();
    const blocked = await call().expect(429);
    expect(blocked.headers['retry-after']).toBeDefined();
  });
});
