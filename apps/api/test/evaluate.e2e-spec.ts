import { evaluate } from '@flagboard/core';
import type { FlagConfig } from '@flagboard/core';
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
const evaluateWith = (key: string, body: object = {}) =>
  s.t.http.post('/v1/evaluate').set(bearer(key)).send(body);

describe('POST /v1/evaluate', () => {
  describe('results', () => {
    it('evaluates every flag for a server key, including the ones hidden from client keys', async () => {
      const { body } = await evaluateWith(serverKey, { context: { userId: 'user-1' } }).expect(200);

      expect(Object.keys(body.flags).sort()).toEqual([
        'by-country',
        'checkout',
        'disabled',
        'killed',
        'partial',
        'secret-flag',
      ]);
      expect(body.flags.checkout).toEqual({ value: 'new', reason: 'ROLLOUT_IN' });
      expect(body.flags['secret-flag']).toEqual({ value: true, reason: 'ROLLOUT_IN' });
    });

    it('reports kill switch, disabled and default states', async () => {
      const { body } = await evaluateWith(serverKey, {
        flags: ['killed', 'disabled', 'by-country'],
      }).expect(200);

      expect(body.flags.killed).toEqual({ value: false, reason: 'KILL_SWITCH' });
      expect(body.flags.disabled).toEqual({ value: false, reason: 'DISABLED' });
      expect(body.flags['by-country']).toEqual({ value: false, reason: 'DEFAULT' });
    });

    it('matches rules on the attributes sent, and tells a server key which rule matched', async () => {
      const ua = await evaluateWith(serverKey, {
        flags: ['by-country'],
        context: { attributes: { country: 'UA' } },
      }).expect(200);
      const de = await evaluateWith(serverKey, {
        flags: ['by-country'],
        context: { attributes: { country: 'DE' } },
      }).expect(200);

      expect(ua.body.flags['by-country']).toEqual({
        value: true,
        reason: 'RULE_MATCH',
        ruleIndex: 0,
      });
      expect(de.body.flags['by-country'].reason).toBe('DEFAULT');
    });

    it('does not apply a partial rollout without a userId', async () => {
      const { body } = await evaluateWith(serverKey, { flags: ['partial'] }).expect(200);
      expect(body.flags.partial).toEqual({ value: false, reason: 'ROLLOUT_NO_USER_ID' });
    });

    it('is stable: the same user always gets the same answer', async () => {
      const ask = async () =>
        (
          await evaluateWith(serverKey, {
            flags: ['partial'],
            context: { userId: 'user-42' },
          }).expect(200)
        ).body.flags.partial;
      const first = await ask();
      expect(await ask()).toEqual(first);
      expect(await ask()).toEqual(first);
    });

    it('gives exactly the answers the shared core gives for the snapshot (the API and the SDK cannot drift)', async () => {
      const snapshot = (await s.t.http.get('/v1/snapshot').set(bearer(serverKey)).expect(200)).body;
      const partial = snapshot.flags.find(
        (f: { key: string }) => f.key === 'partial',
      ) as FlagConfig;

      for (let i = 0; i < 30; i++) {
        const userId = `user-${i}`;
        const { body } = await evaluateWith(serverKey, {
          flags: ['partial'],
          context: { userId },
        }).expect(200);
        const expected = evaluate(partial, { userId }, false);
        expect(body.flags.partial).toEqual({ value: expected.value, reason: expected.reason });
      }
    });

    it('answers FLAG_NOT_FOUND with a null value for unknown and archived flags', async () => {
      const { body } = await evaluateWith(serverKey, { flags: ['nope', 'archived-flag'] }).expect(
        200,
      );
      expect(body.flags.nope).toEqual({ value: null, reason: 'FLAG_NOT_FOUND' });
      expect(body.flags['archived-flag']).toEqual({ value: null, reason: 'FLAG_NOT_FOUND' });
    });

    it('treats a requested key like __proto__ as an ordinary unknown flag', async () => {
      const { body } = await evaluateWith(serverKey, {
        flags: ['__proto__', 'constructor'],
      }).expect(200);

      expect(Object.keys(body.flags).sort()).toEqual(['__proto__', 'constructor']);
      expect(body.flags.constructor).toEqual({ value: null, reason: 'FLAG_NOT_FOUND' });
      expect(({} as Record<string, unknown>).reason).toBeUndefined();
    });

    it('never returns rules, salts or the attributes it was given', async () => {
      const { text } = await evaluateWith(serverKey, {
        context: { userId: 'user-1', attributes: { country: 'UA', secretToken: 'do-not-echo-me' } },
      }).expect(200);

      expect(text).not.toMatch(/salt|rules|conditions|operator|rolloutPercentage/);
      expect(text).not.toContain('do-not-echo-me');
    });

    it('works with an empty body: all flags, no context', async () => {
      const { body } = await evaluateWith(serverKey).expect(200);
      expect(body.flags.checkout.reason).toBe('ROLLOUT_IN');
    });
  });

  describe('client keys', () => {
    it('only see flags marked client-visible when no flags are requested', async () => {
      const { body } = await evaluateWith(clientKey, { context: { userId: 'user-1' } }).expect(200);

      expect(Object.keys(body.flags).sort()).toEqual([
        'by-country',
        'checkout',
        'disabled',
        'killed',
        'partial',
      ]);
      expect(body.flags).not.toHaveProperty('secret-flag');
    });

    it('get FLAG_NOT_FOUND for a hidden flag, indistinguishable from an unknown one', async () => {
      const { body } = await evaluateWith(clientKey, {
        flags: ['secret-flag', 'does-not-exist'],
      }).expect(200);

      expect(body.flags['secret-flag']).toEqual({ value: null, reason: 'FLAG_NOT_FOUND' });
      expect(body.flags['secret-flag']).toEqual(body.flags['does-not-exist']);
    });

    it('get RULE_MATCH without the index of the rule', async () => {
      const { body } = await evaluateWith(clientKey, {
        flags: ['by-country'],
        context: { attributes: { country: 'UA' } },
      }).expect(200);

      expect(body.flags['by-country']).toEqual({ value: true, reason: 'RULE_MATCH' });
      expect(JSON.stringify(body)).not.toContain('ruleIndex');
    });

    it('reflect a flag being made visible or hidden at once', async () => {
      await s.t.http
        .patch(`/api/v1/projects/${projectKey}/flags/secret-flag`)
        .set(s.as(s.adminToken))
        .send({ clientVisible: true })
        .expect(200);
      const shown = await evaluateWith(clientKey, { flags: ['secret-flag'] }).expect(200);
      expect(shown.body.flags['secret-flag'].reason).toBe('ROLLOUT_IN');

      await s.t.http
        .patch(`/api/v1/projects/${projectKey}/flags/secret-flag`)
        .set(s.as(s.adminToken))
        .send({ clientVisible: false })
        .expect(200);
      const hidden = await evaluateWith(clientKey, { flags: ['secret-flag'] }).expect(200);
      expect(hidden.body.flags['secret-flag'].reason).toBe('FLAG_NOT_FOUND');
    });
  });

  describe('input bounds', () => {
    const attributes = (count: number) =>
      Object.fromEntries(Array.from({ length: count }, (_, i) => [`a${i}`, i]));

    it.each([
      ['50 flag keys', { flags: Array.from({ length: 50 }, (_, i) => `f${i}`) }],
      ['20 attributes', { context: { attributes: attributes(20) } }],
      ['an attribute key of 64 characters', { context: { attributes: { ['k'.repeat(64)]: 1 } } }],
      ['an attribute value of 256 characters', { context: { attributes: { a: 'v'.repeat(256) } } }],
      ['a userId of 128 characters', { context: { userId: 'u'.repeat(128) } }],
      ['a flag key of 64 characters', { flags: ['f'.repeat(64)] }],
    ])('accepts %s', async (_label, body) => {
      await evaluateWith(serverKey, body).expect(200);
    });

    it.each([
      ['51 flag keys', { flags: Array.from({ length: 51 }, (_, i) => `f${i}`) }],
      ['21 attributes', { context: { attributes: attributes(21) } }],
      ['an attribute key of 65 characters', { context: { attributes: { ['k'.repeat(65)]: 1 } } }],
      ['an empty attribute key', { context: { attributes: { '': 1 } } }],
      [
        'an attribute string value of 257 characters',
        { context: { attributes: { a: 'v'.repeat(257) } } },
      ],
      ['an object as an attribute value', { context: { attributes: { a: { nested: true } } } }],
      ['null as an attribute value', { context: { attributes: { a: null } } }],
      ['an array as attributes', { context: { attributes: ['a'] } }],
      ['a userId of 129 characters', { context: { userId: 'u'.repeat(129) } }],
      ['a numeric userId', { context: { userId: 123 } }],
      ['a flag key of 65 characters', { flags: ['f'.repeat(65)] }],
      ['a non-string flag key', { flags: [1] }],
      ['flags that are not an array', { flags: 'checkout' }],
      ['an unknown top-level field', { environment: 'prod' }],
      ['an unknown context field', { context: { role: 'admin' } }],
    ])('rejects %s with 400', async (_label, body) => {
      await evaluateWith(serverKey, body).expect(400);
    });

    it('rejects a body over 16 KB with 413', async () => {
      const big = { context: { attributes: { a: 'x' } }, padding: 'p'.repeat(17 * 1024) };
      const response = await evaluateWith(serverKey, big).expect(413);
      expect(response.body).toEqual({ statusCode: 413, message: 'Request body too large' });
    });

    it('accepts a body just under 16 KB', async () => {
      const flags = Array.from(
        { length: 50 },
        (_, i) => `${'f'.repeat(60)}${String(i).padStart(2, '0')}`,
      );
      await evaluateWith(serverKey, {
        flags,
        context: { userId: 'u', attributes: { a: 'v'.repeat(256) } },
      }).expect(200);
    });

    it('rejects malformed JSON with 400', async () => {
      const response = await s.t.http
        .post('/v1/evaluate')
        .set(bearer(serverKey))
        .set('Content-Type', 'application/json')
        .send('{"flags": [')
        .expect(400);
      expect(response.body.statusCode).toBe(400);
    });
  });
});
