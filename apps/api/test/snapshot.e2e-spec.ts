import { createApiKey } from './helpers/api-session.js';
import { seedEvaluationProject, startSession } from './helpers/flag-fixtures.js';
import type { ApiSession } from './helpers/api-session.js';

let s: ApiSession;
let projectKey: string;
let serverKey: string;
let clientKey: string;

beforeAll(async () => {
  s = await startSession();
  ({ projectKey } = await seedEvaluationProject(s));
  serverKey = (await createApiKey(s, projectKey, 'server')).key;
  clientKey = (await createApiKey(s, projectKey, 'client')).key;
});

afterAll(async () => {
  await s.t.close();
});

const bearer = (key: string) => ({ Authorization: `Bearer ${key}` });
const snapshot = (key = serverKey, headers: Record<string, string> = {}) =>
  s.t.http.get('/v1/snapshot').set(bearer(key)).set(headers);
const patchDev = (flag: string, body: object) =>
  s.t.http
    .patch(`/api/v1/projects/${projectKey}/flags/${flag}/environments/dev`)
    .set(s.as(s.adminToken))
    .send(body);

describe('GET /v1/snapshot', () => {
  it('is forbidden for a client key', async () => {
    const response = await snapshot(clientKey).expect(403);
    expect(JSON.stringify(response.body)).not.toContain('salt');
  });

  it('returns the environment configuration to a server key', async () => {
    const response = await snapshot().expect(200);

    expect(response.headers['content-type']).toContain('application/json');
    expect(response.body.environment).toBe('dev');
    const keys = response.body.flags.map((f: { key: string }) => f.key);
    expect(keys).toEqual([...keys].sort());
    expect(keys).toEqual([
      'by-country',
      'checkout',
      'disabled',
      'killed',
      'partial',
      'secret-flag',
    ]);
  });

  it('includes what local evaluation needs: salt, values, state, rules and kill switch', async () => {
    const { body } = await snapshot().expect(200);
    const byCountry = body.flags.find((f: { key: string }) => f.key === 'by-country');
    const killed = body.flags.find((f: { key: string }) => f.key === 'killed');

    expect(byCountry).toMatchObject({
      type: 'boolean',
      onValue: true,
      offValue: false,
      enabled: true,
      rolloutPercentage: 0,
      killSwitch: false,
      rules: [
        { conditions: [{ attribute: 'country', operator: 'equals', value: 'UA' }], serve: 'on' },
      ],
    });
    expect(byCountry.salt).toMatch(/^[0-9a-f]{32}$/);
    expect(killed.killSwitch).toBe(true);
  });

  it('leaves out archived flags and anything time-dependent', async () => {
    const text = (await snapshot().expect(200)).text;

    expect(text).not.toContain('archived-flag');
    expect(text).not.toMatch(/updatedAt|createdAt|revision|archivedAt|killReason/);
  });

  it('sets a strong ETag and tells shared caches not to keep it', async () => {
    const response = await snapshot().expect(200);

    expect(response.headers.etag).toMatch(/^"[0-9a-f]{64}"$/);
    expect(response.headers['cache-control']).toBe('private, no-cache');
    expect(response.headers.vary).toContain('Authorization');
  });

  it('answers 304 with no body when If-None-Match matches', async () => {
    const etag = (await snapshot().expect(200)).headers.etag as string;

    const response = await snapshot(serverKey, { 'If-None-Match': etag }).expect(304);
    expect(response.text).toBe('');
    await snapshot(serverKey, { 'If-None-Match': `W/${etag}` }).expect(304);
    await snapshot(serverKey, { 'If-None-Match': `"nope", ${etag}` }).expect(304);
  });

  it('answers 200 when the validator does not match', async () => {
    await snapshot(serverKey, { 'If-None-Match': '"something-else"' }).expect(200);
  });

  it('returns an identical ETag for identical configuration', async () => {
    const a = (await snapshot().expect(200)).headers.etag;
    const b = (await snapshot().expect(200)).headers.etag;
    expect(a).toBe(b);
  });

  it('gives a different environment its own configuration and ETag', async () => {
    const prodKey = (await createApiKey(s, projectKey, 'server', 'prod')).key;
    const dev = await snapshot().expect(200);
    const prod = await snapshot(prodKey).expect(200);

    expect(prod.body.environment).toBe('prod');
    expect(prod.headers.etag).not.toBe(dev.headers.etag);
    expect(prod.body.flags.every((f: { enabled: boolean }) => f.enabled === false)).toBe(true);
  });

  it('changes the ETag, and shows the change at once, when the environment changes', async () => {
    const before = await snapshot().expect(200);
    await patchDev('checkout', { revision: 2, rolloutPercentage: 40 }).expect(200);

    const after = await snapshot().expect(200);
    expect(after.headers.etag).not.toBe(before.headers.etag);
    expect(
      after.body.flags.find((f: { key: string }) => f.key === 'checkout').rolloutPercentage,
    ).toBe(40);
    await snapshot(serverKey, { 'If-None-Match': before.headers.etag as string }).expect(200);
  });

  it('keeps the ETag when only another environment changes', async () => {
    const before = (await snapshot().expect(200)).headers.etag;
    await s.t.http
      .patch(`/api/v1/projects/${projectKey}/flags/checkout/environments/staging`)
      .set(s.as(s.adminToken))
      .send({ revision: 1, enabled: true })
      .expect(200);

    expect((await snapshot().expect(200)).headers.etag).toBe(before);
  });

  it('changes the ETag when a flag is archived, and when a rule changes', async () => {
    const start = (await snapshot().expect(200)).headers.etag;

    await patchDev('disabled', {
      revision: 1,
      rules: [{ conditions: [{ attribute: 'a', operator: 'equals', value: 1 }], serve: 'on' }],
    }).expect(200);
    const afterRule = (await snapshot().expect(200)).headers.etag;
    expect(afterRule).not.toBe(start);

    await s.t.http
      .patch(`/api/v1/projects/${projectKey}/flags/disabled`)
      .set(s.as(s.adminToken))
      .send({ archived: true })
      .expect(200);
    const afterArchive = await snapshot().expect(200);
    expect(afterArchive.headers.etag).not.toBe(afterRule);
    expect(afterArchive.text).not.toContain('"disabled"');
  });
});
