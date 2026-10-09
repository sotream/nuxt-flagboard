import { createLocalClient, createRemoteClient } from '@flagboard/sdk';
import type { Context, FlagValue, LocalClient, RemoteClient } from '@flagboard/sdk';
import { createApiKey } from './helpers/api-session.js';
import { seedEvaluationProject, startSession } from './helpers/flag-fixtures.js';
import type { ApiSession } from './helpers/api-session.js';

let s: ApiSession;
let local: LocalClient;
let remoteServer: RemoteClient;
let remoteClient: RemoteClient;
let projectKey: string;
let clientKey: string;

const ALL_FLAGS = ['checkout', 'secret-flag', 'by-country', 'partial', 'disabled', 'killed'];
const defaultFor = (flag: string): FlagValue => (flag === 'checkout' ? 'fallback' : false);

const CONTEXTS: Context[] = [
  {},
  { userId: 'user-1' },
  { userId: 'user-1', attributes: { country: 'UA' } },
  { attributes: { country: 'DE' } },
  { userId: 'юзер-😀', attributes: { country: 'UA', plan: 'pro' } },
  ...Array.from({ length: 40 }, (_, i) => ({ userId: `user-${i}` })),
];

beforeAll(async () => {
  s = await startSession();
  ({ projectKey } = await seedEvaluationProject(s));
  const serverKey = (await createApiKey(s, projectKey, 'server')).key;
  clientKey = (await createApiKey(s, projectKey, 'client')).key;
  local = createLocalClient({ baseUrl: s.t.baseUrl, key: serverKey });
  await local.init();
  remoteServer = createRemoteClient({ baseUrl: s.t.baseUrl, key: serverKey });
  remoteClient = createRemoteClient({ baseUrl: s.t.baseUrl, key: clientKey });
});

afterAll(async () => {
  local.close();
  remoteServer.close();
  remoteClient.close();
  await s.t.close();
});

describe('the SDK and the API give the same answers', () => {
  it('local evaluation equals remote evaluation, for every flag and context', async () => {
    for (const flag of ALL_FLAGS) {
      for (const context of CONTEXTS) {
        const remote = await remoteServer.evaluate(flag, context, defaultFor(flag));
        const here = local.evaluate(flag, context, defaultFor(flag));
        expect(here, `${flag} for ${JSON.stringify(context)}`).toEqual(remote);
      }
    }
  });

  it('agrees on unknown and archived flags', async () => {
    for (const flag of ['nope', 'archived-flag']) {
      expect(local.evaluate(flag, {}, 'd')).toEqual(await remoteServer.evaluate(flag, {}, 'd'));
      expect(local.evaluate(flag, {}, 'd')).toEqual({ value: 'd', reason: 'FLAG_NOT_FOUND' });
    }
  });

  it('a client key evaluates the client-visible flags the same way, and sees the others as unknown', async () => {
    for (const flag of ['checkout', 'by-country', 'partial', 'disabled', 'killed']) {
      for (const context of CONTEXTS) {
        const viaClient = await remoteClient.evaluate(flag, context, defaultFor(flag));
        const viaServer = await remoteServer.evaluate(flag, context, defaultFor(flag));
        // A client key never learns which rule matched, so compare without the rule index.
        expect(viaClient.value).toEqual(viaServer.value);
        expect(viaClient.reason).toBe(viaServer.reason);
        expect(viaClient).not.toHaveProperty('ruleIndex');
      }
    }
    expect(await remoteClient.evaluate('secret-flag', {}, 'hidden-default')).toEqual({
      value: 'hidden-default',
      reason: 'FLAG_NOT_FOUND',
    });
  });

  it('evaluateAll returns what the key may see', async () => {
    const all = await remoteClient.evaluateAll({ userId: 'user-1' });
    expect(Object.keys(all).sort()).toEqual([
      'by-country',
      'checkout',
      'disabled',
      'killed',
      'partial',
    ]);
  });

  it('a local client built with a client key fails to start with a helpful message', async () => {
    const wrong = createLocalClient({ baseUrl: s.t.baseUrl, key: clientKey });
    await expect(wrong.init()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(wrong.init()).rejects.toThrow('createRemoteClient');
  });

  it('a local client sees a change after refresh and a 304 when nothing changed', async () => {
    expect(await local.refresh()).toBe(false);

    await s.t.http
      .patch(`/api/v1/projects/${projectKey}/flags/checkout/environments/dev`)
      .set(s.as(s.adminToken))
      .send({ revision: 2, enabled: false })
      .expect(200);

    expect(await local.refresh()).toBe(true);
    expect(local.evaluate('checkout', {}, 'x')).toEqual({ value: 'old', reason: 'DISABLED' });
    expect(await remoteServer.evaluate('checkout', {}, 'x')).toEqual({
      value: 'old',
      reason: 'DISABLED',
    });
  });
});
