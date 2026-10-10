import { createApiKey } from './helpers/api-session.js';
import { seedEvaluationProject, startSession } from './helpers/flag-fixtures.js';
import type { ApiSession } from './helpers/api-session.js';

let s: ApiSession;
let clientKey: string;
let serverKey: string;

const ORIGIN = 'https://shop.example.org';
const corsHeaders = (headers: Record<string, unknown>) =>
  Object.keys(headers).filter((name) => name.startsWith('access-control-'));

beforeAll(async () => {
  s = await startSession();
  const { projectKey } = await seedEvaluationProject(s);
  clientKey = (await createApiKey(s, projectKey, 'client')).key;
  serverKey = (await createApiKey(s, projectKey, 'server')).key;
});

afterAll(async () => {
  await s.t.close();
});

describe('CORS on POST /v1/evaluate', () => {
  it('answers the preflight with 204 and the allowed methods and headers, without a key', async () => {
    const response = await s.t.http
      .options('/v1/evaluate')
      .set('Origin', ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type')
      .expect(204);

    expect(response.headers['access-control-allow-origin']).toBe('*');
    expect(response.headers['access-control-allow-methods']).toBe('POST, OPTIONS');
    expect(response.headers['access-control-allow-headers']).toBe('Authorization, Content-Type');
    // Chromium caps the preflight cache at 7200 s (Firefox 86400), so a larger number would be misleading.
    expect(response.headers['access-control-max-age']).toBe('7200');
    expect(response.text).toBe('');
  });

  it('never allows credentials, so cookies are never sent with these requests', async () => {
    const preflight = await s.t.http.options('/v1/evaluate').set('Origin', ORIGIN).expect(204);
    const real = await s.t.http
      .post('/v1/evaluate')
      .set({ Authorization: `Bearer ${clientKey}`, Origin: ORIGIN })
      .send({})
      .expect(200);

    expect(preflight.headers).not.toHaveProperty('access-control-allow-credentials');
    expect(real.headers).not.toHaveProperty('access-control-allow-credentials');
  });

  it('lets the page read the answer to a real request', async () => {
    const response = await s.t.http
      .post('/v1/evaluate')
      .set({ Authorization: `Bearer ${clientKey}`, Origin: ORIGIN })
      .send({ flags: ['checkout'] })
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBe('*');
    expect(response.body.flags.checkout.reason).toBe('ROLLOUT_IN');
  });

  it('lets the page read errors too: 401, 400 and 413 carry the header', async () => {
    const badKey = await s.t.http.post('/v1/evaluate').set('Origin', ORIGIN).send({}).expect(401);
    const badBody = await s.t.http
      .post('/v1/evaluate')
      .set({ Authorization: `Bearer ${clientKey}`, Origin: ORIGIN })
      .send({ flags: 'nope' })
      .expect(400);
    const tooBig = await s.t.http
      .post('/v1/evaluate')
      .set({ Authorization: `Bearer ${clientKey}`, Origin: ORIGIN })
      .send({ padding: 'p'.repeat(17 * 1024) })
      .expect(413);

    for (const response of [badKey, badBody, tooBig]) {
      expect(response.headers['access-control-allow-origin']).toBe('*');
    }
    expect(badKey.headers['access-control-expose-headers']).toBe('Retry-After');
  });
});

describe('everything else stays same-origin only', () => {
  it('adds no CORS headers to /v1/snapshot, for a server key, a client key or no key', async () => {
    for (const authorization of [`Bearer ${serverKey}`, `Bearer ${clientKey}`, undefined]) {
      const request = s.t.http.get('/v1/snapshot').set('Origin', ORIGIN);
      const response = await (authorization
        ? request.set('Authorization', authorization)
        : request);
      expect(corsHeaders(response.headers), `status ${response.status}`).toEqual([]);
    }
  });

  it('does not answer a preflight for /v1/snapshot', async () => {
    const response = await s.t.http
      .options('/v1/snapshot')
      .set('Origin', ORIGIN)
      .set('Access-Control-Request-Method', 'GET');
    expect(response.status).not.toBe(204);
    expect(corsHeaders(response.headers)).toEqual([]);
  });

  it('adds no CORS headers to the admin API, including sign-in and the event stream', async () => {
    const targets = [
      s.t.http.get('/api/v1/projects').set('Origin', ORIGIN),
      s.t.http
        .post('/api/v1/auth/login')
        .set('Origin', ORIGIN)
        .send({ email: 'a@b.co', password: 'x' }),
      s.t.http
        .options('/api/v1/projects')
        .set('Origin', ORIGIN)
        .set('Access-Control-Request-Method', 'GET'),
      s.t.http
        .options('/api/v1/auth/login')
        .set('Origin', ORIGIN)
        .set('Access-Control-Request-Method', 'POST'),
      s.t.http.get('/api/v1/projects').set(s.as(s.adminToken)).set('Origin', ORIGIN),
    ];
    for (const target of targets) {
      const response = await target;
      expect(corsHeaders(response.headers), `${response.status}`).toEqual([]);
    }
    expect((await s.t.http.options('/api/v1/auth/login').set('Origin', ORIGIN)).status).not.toBe(
      204,
    );
  });

  it('adds no CORS headers to /health', async () => {
    const response = await s.t.http.get('/health').set('Origin', ORIGIN).expect(200);
    expect(corsHeaders(response.headers)).toEqual([]);
  });
});
