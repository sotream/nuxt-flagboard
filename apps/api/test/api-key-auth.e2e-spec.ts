import { generateApiKey } from '../src/modules/api-keys/api-key.js';
import { createApiKey } from './helpers/api-session.js';
import { seedEvaluationProject, startSession } from './helpers/flag-fixtures.js';
import type { ApiSession } from './helpers/api-session.js';

let s: ApiSession;
let projectKey: string;
let serverKey: string;
let serverKeyId: string;
let clientKey: string;

beforeAll(async () => {
  s = await startSession();
  ({ projectKey } = await seedEvaluationProject(s));
  ({ key: serverKey, id: serverKeyId } = await createApiKey(s, projectKey, 'server'));
  clientKey = (await createApiKey(s, projectKey, 'client')).key;
});

afterAll(async () => {
  await s.t.close();
});

const bearer = (key: string) => ({ Authorization: `Bearer ${key}` });
const evaluate = (headers: Record<string, string>) =>
  s.t.http.post('/v1/evaluate').set(headers).send({});

describe('API key authentication on /v1', () => {
  it('rejects a missing Authorization header', async () => {
    const response = await evaluate({}).expect(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
  });

  it.each([
    ['a wrong scheme', (key: string) => ({ Authorization: `Basic ${key}` })],
    ['no scheme', (key: string) => ({ Authorization: key })],
    ['extra parts', (key: string) => ({ Authorization: `Bearer ${key} extra` })],
    ['an empty token', () => ({ Authorization: 'Bearer ' })],
    ['a malformed key', () => ({ Authorization: 'Bearer fb_srv_short' })],
    ['a JWT', () => ({ Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc' })],
    ['an unknown but well-formed key', () => bearer(generateApiKey('server').plaintext)],
  ])('rejects %s with 401', async (_label, headers) => {
    await evaluate(headers(serverKey)).expect(401);
  });

  it('does not accept a signed-in user token', async () => {
    await evaluate(bearer(s.adminToken)).expect(401);
  });

  it('does not let an API key into the admin API', async () => {
    await s.t.http.get('/api/v1/projects').set(bearer(serverKey)).expect(401);
  });

  it('accepts server and client keys on evaluate', async () => {
    await evaluate(bearer(serverKey)).expect(200);
    await evaluate(bearer(clientKey)).expect(200);
  });

  it('stops accepting a key the moment it is revoked, even though it was cached', async () => {
    const { key, id } = await createApiKey(s, projectKey, 'server');
    await evaluate(bearer(key)).expect(200);
    await evaluate(bearer(key)).expect(200);

    await s.t.http
      .delete(`/api/v1/projects/${projectKey}/keys/${id}`)
      .set(s.as(s.adminToken))
      .expect(204);

    await evaluate(bearer(key)).expect(401);
  });

  it('keeps other keys working when one is revoked', async () => {
    const { id } = await createApiKey(s, projectKey, 'server');
    await s.t.http
      .delete(`/api/v1/projects/${projectKey}/keys/${id}`)
      .set(s.as(s.adminToken))
      .expect(204);

    await evaluate(bearer(serverKey)).expect(200);
    expect(serverKeyId).toBeDefined();
  });

  it('scopes a key to its environment: a dev key never sees prod', async () => {
    const dev = await s.t.http
      .post('/v1/evaluate')
      .set(bearer(serverKey))
      .send({ flags: ['checkout'] })
      .expect(200);
    const prodKey = (await createApiKey(s, projectKey, 'server', 'prod')).key;
    const prod = await s.t.http
      .post('/v1/evaluate')
      .set(bearer(prodKey))
      .send({ flags: ['checkout'] })
      .expect(200);

    expect(dev.body.flags.checkout.reason).toBe('ROLLOUT_IN');
    expect(prod.body.flags.checkout.reason).toBe('DISABLED');
  });
});
