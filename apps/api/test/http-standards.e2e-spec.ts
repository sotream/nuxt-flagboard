import { startSession } from './helpers/api-session.js';
import type { ApiSession } from './helpers/api-session.js';
import { createApiKey } from './helpers/api-session.js';
import { WEB_ORIGIN } from './helpers/test-app.js';

let s: ApiSession;
let serverKey: string;

beforeAll(async () => {
  s = await startSession();
  const { key } = await s.newProject();
  serverKey = (await createApiKey(s, key, 'server')).key;
});

afterAll(async () => {
  await s.t.close();
});

describe('405 Method Not Allowed (RFC 9110 §15.5.6)', () => {
  it('lists the allowed methods in Allow when the path exists for others', async () => {
    const response = await s.t.http.delete('/v1/evaluate').expect(405);
    expect(response.headers.allow).toBe('POST');
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body).toMatchObject({
      type: 'about:blank',
      title: 'Method Not Allowed',
      status: 405,
    });
  });

  it('adds HEAD when GET is allowed, and sorts', async () => {
    const response = await s.t.http.put('/api/v1/projects').set(s.as(s.adminToken)).expect(405);
    expect(response.headers.allow).toBe('GET, HEAD, POST');
  });

  it('is still a 404 for a path nothing is registered on', async () => {
    const response = await s.t.http.delete('/v1/nothing').expect(404);
    expect(response.headers.allow).toBeUndefined();
  });

  it('is still a 404 for a missing resource on a known path', async () => {
    const response = await s.t.http
      .get('/api/v1/projects/not-there-1')
      .set(s.as(s.adminToken))
      .expect(404);
    expect(response.headers.allow).toBeUndefined();
  });
});

describe('415 Unsupported Media Type (RFC 9110 §15.5.16)', () => {
  it('rejects a body that is not JSON on the admin API', async () => {
    const response = await s.t.http
      .post('/api/v1/auth/login')
      .set('Origin', WEB_ORIGIN)
      .set('Content-Type', 'text/plain')
      .send('email=a')
      .expect(415);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body).toMatchObject({ status: 415, title: 'Unsupported Media Type' });
  });

  it('rejects it on the public API too, with the CORS headers a page needs to read the error', async () => {
    const response = await s.t.http
      .post('/v1/evaluate')
      .set('Authorization', `Bearer ${serverKey}`)
      .set('Origin', 'https://app.example')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send('a=1')
      .expect(415);
    expect(response.headers['access-control-allow-origin']).toBe('*');
  });

  it('accepts JSON with a charset or a +json type, and requests without a body', async () => {
    await s.t.http
      .post('/v1/evaluate')
      .set('Authorization', `Bearer ${serverKey}`)
      .set('Content-Type', 'application/json; charset=utf-8')
      .send('{}')
      .expect(200);
    await s.t.http.post('/api/v1/auth/logout').set('Origin', WEB_ORIGIN).expect(204);
  });
});

describe('Cache-Control: no-store on the admin API (RFC 9111 §5.2.2.5)', () => {
  it('is set on ordinary responses and errors', async () => {
    const ok = await s.t.http.get('/api/v1/projects').set(s.as(s.adminToken)).expect(200);
    expect(ok.headers['cache-control']).toBe('no-store');
    const denied = await s.t.http.get('/api/v1/projects').expect(401);
    expect(denied.headers['cache-control']).toBe('no-store');
  });

  it('is set with Pragma: no-cache on the responses that carry a token', async () => {
    const response = await s.t.http
      .post('/api/v1/auth/login')
      .set('Origin', WEB_ORIGIN)
      .send({ email: s.admin.email, password: s.admin.password })
      .expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.pragma).toBe('no-cache');
  });

  it('is not set on the public snapshot, which has its own caching rules', async () => {
    const response = await s.t.http
      .get('/v1/snapshot')
      .set('Authorization', `Bearer ${serverKey}`)
      .expect(200);
    expect(response.headers['cache-control']).toBe('private, no-cache');
  });
});

describe('conditional requests on the snapshot (RFC 9110 §13.1.2, §15.4.5)', () => {
  it('answers 304 with the validators repeated when If-None-Match lists the current tag among others', async () => {
    const first = await s.t.http
      .get('/v1/snapshot')
      .set('Authorization', `Bearer ${serverKey}`)
      .expect(200);
    const etag = first.headers.etag as string;
    const response = await s.t.http
      .get('/v1/snapshot')
      .set('Authorization', `Bearer ${serverKey}`)
      .set('If-None-Match', `"zzz", W/${etag}`)
      .expect(304);
    expect(response.headers.etag).toBe(etag);
    expect(response.headers['cache-control']).toBe('private, no-cache');
    expect(response.headers.vary).toContain('Authorization');
    expect(response.text).toBe('');
  });

  it('answers HEAD like GET without a body', async () => {
    const response = await s.t.http
      .head('/v1/snapshot')
      .set('Authorization', `Bearer ${serverKey}`)
      .expect(200);
    expect(response.headers.etag).toMatch(/^"[0-9a-f]{64}"$/);
    expect(response.text ?? '').toBe('');
  });
});

describe('201 Created names the new resource in Location (RFC 9110 §10.2.2)', () => {
  it('for a project, and the Location answers a GET with that project', async () => {
    const key = `loc-${Math.random().toString(36).slice(2, 8)}`;
    const created = await s.t.http
      .post('/api/v1/projects')
      .set(s.as(s.adminToken))
      .send({ key, name: 'Located' })
      .expect(201);
    expect(created.headers.location).toBe(`/api/v1/projects/${key}`);
    const fetched = await s.t.http
      .get(created.headers.location as string)
      .set(s.as(s.adminToken))
      .expect(200);
    expect(fetched.body.key).toBe(key);
  });

  it('for a flag, and a failed create has no Location', async () => {
    const { key: project } = await s.newProject();
    const body = { key: 'located-flag', name: 'Located', type: 'boolean' };
    const created = await s.t.http
      .post(`/api/v1/projects/${project}/flags`)
      .set(s.as(s.adminToken))
      .send(body)
      .expect(201);
    expect(created.headers.location).toBe(`/api/v1/projects/${project}/flags/located-flag`);
    await s.t.http
      .get(created.headers.location as string)
      .set(s.as(s.adminToken))
      .expect(200);

    const duplicate = await s.t.http
      .post(`/api/v1/projects/${project}/flags`)
      .set(s.as(s.adminToken))
      .send(body)
      .expect(409);
    expect(duplicate.headers.location).toBeUndefined();
  });
});
