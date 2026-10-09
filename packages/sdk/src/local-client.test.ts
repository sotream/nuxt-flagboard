import { evaluate } from '@flagboard/core';
import type { Context, FlagConfig } from '@flagboard/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FlagboardError } from './errors.js';
import { createLocalClient } from './local-client.js';
import { closedPortUrl, json, startServer } from './test-support/server.js';
import type { Handler, TestServer } from './test-support/server.js';

const KEY = `fb_srv_${'S'.repeat(43)}`;
const SALT = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

const flag = (overrides: Partial<FlagConfig> & { key: string }): FlagConfig => ({
  type: 'boolean',
  onValue: true,
  offValue: false,
  salt: SALT,
  enabled: true,
  rolloutPercentage: 0,
  rules: [],
  killSwitch: false,
  ...overrides,
});

const FLAGS: FlagConfig[] = [
  flag({ key: 'on', rolloutPercentage: 100 }),
  flag({ key: 'disabled', enabled: false, rolloutPercentage: 100 }),
  flag({ key: 'killed', rolloutPercentage: 100, killSwitch: true }),
  flag({ key: 'half', rolloutPercentage: 50 }),
  flag({
    key: 'by-country',
    type: 'string',
    onValue: 'new',
    offValue: 'old',
    rules: [
      { conditions: [{ attribute: 'country', operator: 'in', values: ['UA', 'PL'] }], serve: 'on' },
    ],
  }),
];

/** A snapshot endpoint whose content can change, with a strong ETag and 304 handling. */
function snapshotHandler(state: { flags: FlagConfig[]; version: number }): Handler {
  return (request, response) => {
    const etag = `"v${state.version}"`;
    if (request.headers['if-none-match'] === etag) {
      response.writeHead(304, { ETag: etag });
      response.end();
      return;
    }
    json(response, 200, { environment: 'dev', flags: state.flags }, { ETag: etag });
  };
}

let server: TestServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});
const serve = async (handler: Handler) => (server = await startServer(handler));

describe('createLocalClient', () => {
  describe('init and evaluate', () => {
    it('loads the snapshot, sending the key and no validator the first time', async () => {
      const s = await serve(snapshotHandler({ flags: FLAGS, version: 1 }));
      const client = createLocalClient({ baseUrl: s.url, key: KEY });

      await client.init();

      expect(s.requests).toHaveLength(1);
      expect(s.requests[0]!.method).toBe('GET');
      expect(s.requests[0]!.url).toBe('/v1/snapshot');
      expect(s.requests[0]!.headers.authorization).toBe(`Bearer ${KEY}`);
      expect(s.requests[0]!.headers['if-none-match']).toBeUndefined();
    });

    it('evaluates exactly as the shared core does, for every flag and a spread of contexts', async () => {
      const s = await serve(snapshotHandler({ flags: FLAGS, version: 1 }));
      const client = createLocalClient({ baseUrl: s.url, key: KEY });
      await client.init();

      const contexts: Context[] = [
        {},
        { userId: 'user-1' },
        { userId: 'user-2' },
        { userId: 'user-1', attributes: { country: 'UA' } },
        { attributes: { country: 'PL' } },
        { userId: 'юзер-😀', attributes: { country: 'DE' } },
        ...Array.from({ length: 40 }, (_, i) => ({ userId: `user-${i}` })),
      ];
      for (const config of FLAGS) {
        for (const context of contexts) {
          const fallback = config.type === 'boolean' ? false : 'fallback';
          expect(client.evaluate(config.key, context, fallback)).toEqual(
            evaluate(config, context, fallback),
          );
        }
      }
    });

    it('gives the documented answers for the main states', async () => {
      const s = await serve(snapshotHandler({ flags: FLAGS, version: 1 }));
      const client = createLocalClient({ baseUrl: s.url, key: KEY });
      await client.init();

      expect(client.evaluate('on', {}, false)).toEqual({ value: true, reason: 'ROLLOUT_IN' });
      expect(client.evaluate('disabled', {}, true)).toEqual({ value: false, reason: 'DISABLED' });
      expect(client.evaluate('killed', {}, true)).toEqual({ value: false, reason: 'KILL_SWITCH' });
      expect(client.evaluate('half', {}, true)).toEqual({
        value: false,
        reason: 'ROLLOUT_NO_USER_ID',
      });
      expect(client.evaluate('half', { userId: 'user-1' }, false)).toEqual({
        value: true,
        reason: 'ROLLOUT_IN',
      });
      expect(client.evaluate('by-country', { attributes: { country: 'UA' } }, 'x')).toEqual({
        value: 'new',
        reason: 'RULE_MATCH',
        ruleIndex: 0,
      });
    });

    it('returns the default with FLAG_NOT_FOUND for an unknown flag, and never throws', async () => {
      const s = await serve(snapshotHandler({ flags: FLAGS, version: 1 }));
      const client = createLocalClient({ baseUrl: s.url, key: KEY });
      await client.init();

      expect(client.evaluate('nope', {}, 'fallback')).toEqual({
        value: 'fallback',
        reason: 'FLAG_NOT_FOUND',
      });
      expect(client.evaluate('constructor', {}, 'fallback').reason).toBe('FLAG_NOT_FOUND');
      expect(client.evaluate('__proto__', {}, 'fallback').reason).toBe('FLAG_NOT_FOUND');
    });

    it('returns the default with reason ERROR until a snapshot has loaded', () => {
      const client = createLocalClient({ baseUrl: 'http://example.test', key: KEY });
      expect(client.evaluate('on', {}, 'fallback')).toEqual({ value: 'fallback', reason: 'ERROR' });
    });
  });

  describe('init fails loudly', () => {
    const initError = async (handler: Handler): Promise<FlagboardError> => {
      const s = await serve(handler);
      const client = createLocalClient({ baseUrl: s.url, key: KEY });
      const error = await client.init().then(
        () => undefined,
        (e: FlagboardError) => e,
      );
      expect(error).toBeDefined();
      expect(client.evaluate('on', {}, 'd')).toEqual({ value: 'd', reason: 'ERROR' });
      return error!;
    };

    it('with a clear message for a client key (403), which cannot read the snapshot', async () => {
      const error = await initError((_req, res) => json(res, 403, {}));
      expect(error.code).toBe('FORBIDDEN');
      expect(error.message).toContain('server key');
      expect(error.message).toContain('createRemoteClient');
      expect(error.message).not.toContain(KEY);
    });

    it('for an unknown or revoked key (401)', async () => {
      expect((await initError((_req, res) => json(res, 401, {}))).code).toBe('INVALID_KEY');
    });

    it('for a server error', async () => {
      expect((await initError((_req, res) => json(res, 503, {}))).code).toBe('SERVER');
    });

    it.each([
      [
        'a body that is not JSON',
        (_req: never, res: Parameters<Handler>[1]) => {
          res.writeHead(200);
          res.end('nope');
        },
      ],
      [
        'JSON of the wrong shape',
        (_req: never, res: Parameters<Handler>[1]) => json(res, 200, { flags: 'x' }),
      ],
      [
        'a flag without a key',
        (_req: never, res: Parameters<Handler>[1]) =>
          json(res, 200, { flags: [{ enabled: true }] }),
      ],
    ])('for %s', async (_label, handler) => {
      expect((await initError(handler as Handler)).code).toBe('BAD_RESPONSE');
    });

    it('when nothing listens on the address', async () => {
      const client = createLocalClient({ baseUrl: await closedPortUrl(), key: KEY });
      await expect(client.init()).rejects.toMatchObject({ code: 'NETWORK' });
    });

    it('when the server is slower than the timeout', async () => {
      const s = await serve(() => undefined);
      const client = createLocalClient({ baseUrl: s.url, key: KEY, timeoutMs: 100 });
      await expect(client.init()).rejects.toMatchObject({ code: 'TIMEOUT' });
    });
  });

  describe('refresh', () => {
    it('sends the last ETag and reports no change on 304', async () => {
      const state = { flags: FLAGS, version: 1 };
      const s = await serve(snapshotHandler(state));
      const client = createLocalClient({ baseUrl: s.url, key: KEY });
      await client.init();

      expect(await client.refresh()).toBe(false);

      expect(s.requests[1]!.headers['if-none-match']).toBe('"v1"');
      expect(client.evaluate('on', {}, false).value).toBe(true);
    });

    it('picks up a changed snapshot and resolves true', async () => {
      const state = { flags: FLAGS, version: 1 };
      const s = await serve(snapshotHandler(state));
      const client = createLocalClient({ baseUrl: s.url, key: KEY });
      await client.init();
      expect(client.evaluate('on', {}, false).value).toBe(true);

      state.flags = [flag({ key: 'on', enabled: false })];
      state.version = 2;

      expect(await client.refresh()).toBe(true);
      expect(client.evaluate('on', {}, true)).toEqual({ value: false, reason: 'DISABLED' });
      expect(client.evaluate('half', {}, 'gone').reason).toBe('FLAG_NOT_FOUND'); // removed flags disappear
      await client.refresh();
      expect(s.requests.at(-1)!.headers['if-none-match']).toBe('"v2"');
    });

    it('keeps serving the last snapshot when a refresh fails, reports it, and recovers later', async () => {
      const state = { flags: FLAGS, version: 1 };
      let failing = false;
      const s = await serve((req, res) =>
        failing ? json(res, 500, {}) : snapshotHandler(state)(req, res),
      );
      const errors: FlagboardError[] = [];
      const client = createLocalClient({
        baseUrl: s.url,
        key: KEY,
        onError: (e) => errors.push(e),
      });
      await client.init();

      failing = true;
      expect(await client.refresh()).toBe(false);
      expect(errors.map((e) => e.code)).toEqual(['SERVER']);
      expect(client.evaluate('on', {}, false)).toEqual({ value: true, reason: 'ROLLOUT_IN' }); // stale, not lost

      failing = false;
      state.flags = [
        flag({ key: 'on', rolloutPercentage: 100 }),
        flag({ key: 'fresh', rolloutPercentage: 100 }),
      ];
      state.version = 2;
      expect(await client.refresh()).toBe(true);
      expect(client.evaluate('fresh', {}, false).value).toBe(true);
    });

    it('keeps the last snapshot when the API cannot be reached or answers nonsense', async () => {
      const state = { flags: FLAGS, version: 1 };
      let mode: 'ok' | 'garbage' = 'ok';
      const s = await serve((req, res) => {
        if (mode === 'garbage') {
          res.writeHead(200);
          res.end('<html>');
        } else snapshotHandler(state)(req, res);
      });
      const errors: FlagboardError[] = [];
      const client = createLocalClient({
        baseUrl: s.url,
        key: KEY,
        onError: (e) => errors.push(e),
      });
      await client.init();

      mode = 'garbage';
      expect(await client.refresh()).toBe(false);
      expect(errors.map((e) => e.code)).toEqual(['BAD_RESPONSE']);
      expect(client.evaluate('on', {}, false).value).toBe(true);
    });

    describe('with a corrupted snapshot', () => {
      const corruptions: [string, Record<string, unknown>][] = [
        ['a rule without a conditions list', { rules: [{ serve: 'on' }] }],
        ['a rule that serves neither on nor off', { rules: [{ conditions: [], serve: 'maybe' }] }],
        ['a condition with an unknown operator', { rules: [ruleWith({ operator: 'regex' })] }],
        ['an `in` condition without values', { rules: [ruleWith({ operator: 'in' })] }],
        ['an `equals` condition without a value', { rules: [ruleWith({ operator: 'equals' })] }],
        ['a condition value that is an object', { rules: [ruleWith({ value: { a: 1 } })] }],
        ['a boolean flag with a string on value', { onValue: 'yes' }],
        [
          'a string flag with a boolean off value',
          { type: 'string', onValue: 'a', offValue: false },
        ],
        ['a rollout above 100', { rolloutPercentage: 150 }],
        ['a fractional rollout', { rolloutPercentage: 12.5 }],
      ];

      function ruleWith(condition: Record<string, unknown>): Record<string, unknown> {
        return {
          conditions: [{ attribute: 'country', operator: 'equals', ...condition }],
          serve: 'on',
        };
      }

      const corrupted = (change: Record<string, unknown>) =>
        [{ ...flag({ key: 'bad', rolloutPercentage: 100 }), ...change }] as unknown as FlagConfig[];

      it.each(corruptions)('refuses %s when loading', async (_label, change) => {
        const s = await serve(snapshotHandler({ flags: corrupted(change), version: 1 }));
        const client = createLocalClient({ baseUrl: s.url, key: KEY });

        await expect(client.init()).rejects.toMatchObject({ code: 'BAD_RESPONSE' });
        expect(client.evaluate('bad', {}, false)).toEqual({ value: false, reason: 'ERROR' });
      });

      it.each(corruptions)(
        'keeps the last good snapshot after %s arrives',
        async (_label, change) => {
          const state = { flags: FLAGS, version: 1 };
          const s = await serve(snapshotHandler(state));
          const errors: FlagboardError[] = [];
          const client = createLocalClient({
            baseUrl: s.url,
            key: KEY,
            onError: (e) => errors.push(e),
          });
          await client.init();

          state.flags = corrupted(change);
          state.version = 2;

          expect(await client.refresh()).toBe(false);
          expect(errors.map((e) => e.code)).toEqual(['BAD_RESPONSE']);
          expect(client.evaluate('on', {}, false).value).toBe(true);
        },
      );
    });

    it('returns the default with reason ERROR instead of throwing when evaluation itself fails', async () => {
      const s = await serve(snapshotHandler({ flags: FLAGS, version: 1 }));
      const client = createLocalClient({ baseUrl: s.url, key: KEY });
      await client.init();

      // A JavaScript caller can pass no context at all; `half` is the flag that reads it.
      const result = client.evaluate('half', undefined as unknown as Context, 'fallback');

      expect(result).toEqual({ value: 'fallback', reason: 'ERROR' });
    });

    it('shares one request between overlapping refreshes', async () => {
      const state = { flags: FLAGS, version: 1 };
      const s = await serve(snapshotHandler(state));
      const client = createLocalClient({ baseUrl: s.url, key: KEY });
      await client.init();

      await Promise.all([client.refresh(), client.refresh(), client.refresh()]);

      expect(s.requests).toHaveLength(2); // init + one shared refresh
    });
  });

  describe('polling', () => {
    /** A fake fetch, so timers can be faked without a real socket. Records every call. */
    function fakeApi(handler: (call: number) => Response | Promise<Response>) {
      const calls: { signal: AbortSignal | undefined; etag: string | null }[] = [];
      const impl = vi.fn(async (_url: unknown, init?: RequestInit) => {
        calls.push({
          signal: init?.signal ?? undefined,
          etag: new Headers(init?.headers).get('if-none-match'),
        });
        return handler(calls.length);
      });
      return { fetch: impl as unknown as typeof fetch, calls };
    }
    const snapshotResponse = (version: number) =>
      new Response(JSON.stringify({ environment: 'dev', flags: FLAGS }), {
        status: 200,
        headers: { ETag: `"v${version}"` },
      });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('polls on the interval with jitter and asks for 304s', async () => {
      vi.useFakeTimers();
      const api = fakeApi((call) =>
        call === 1 ? snapshotResponse(1) : new Response(null, { status: 304 }),
      );
      const client = createLocalClient({
        baseUrl: 'http://example.test',
        key: KEY,
        fetch: api.fetch,
        pollIntervalMs: 10_000,
        random: () => 0, // the earliest the jitter allows: 90% of the interval
      });
      await client.init();
      expect(api.calls).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(8_999);
      expect(api.calls).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(2);
      expect(api.calls).toHaveLength(2);
      expect(api.calls[1]!.etag).toBe('"v1"');

      await vi.advanceTimersByTimeAsync(9_000);
      expect(api.calls).toHaveLength(3);
      client.close();
    });

    it('uses the latest allowed delay when the random value is near 1', async () => {
      vi.useFakeTimers();
      const api = fakeApi((call) =>
        call === 1 ? snapshotResponse(1) : new Response(null, { status: 304 }),
      );
      const client = createLocalClient({
        baseUrl: 'http://example.test',
        key: KEY,
        fetch: api.fetch,
        pollIntervalMs: 10_000,
        random: () => 0.999999,
      });
      await client.init();

      await vi.advanceTimersByTimeAsync(10_990); // the delay is about 10 999.998 ms, never 11 000 or more
      expect(api.calls).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(11);
      expect(api.calls).toHaveLength(2);
      client.close();
    });

    it('keeps polling after a failed poll, reporting it once', async () => {
      vi.useFakeTimers();
      const api = fakeApi((call) => {
        if (call === 2) return new Response('boom', { status: 500 });
        return call === 1 ? snapshotResponse(1) : snapshotResponse(call);
      });
      const errors: FlagboardError[] = [];
      const client = createLocalClient({
        baseUrl: 'http://example.test',
        key: KEY,
        fetch: api.fetch,
        pollIntervalMs: 1_000,
        random: () => 0.5,
        onError: (e) => errors.push(e),
      });
      await client.init();

      await vi.advanceTimersByTimeAsync(3_000);

      expect(api.calls).toHaveLength(4);
      expect(errors.map((e) => e.code)).toEqual(['SERVER']);
      expect(client.evaluate('on', {}, false).value).toBe(true);
      client.close();
    });

    it('does not start a new poll while the previous one is still running', async () => {
      vi.useFakeTimers();
      let release: (() => void) | undefined;
      const api = fakeApi((call) =>
        call === 1
          ? snapshotResponse(1)
          : new Promise<Response>((resolve) => {
              release = () => resolve(new Response(null, { status: 304 }));
            }),
      );
      const client = createLocalClient({
        baseUrl: 'http://example.test',
        key: KEY,
        fetch: api.fetch,
        pollIntervalMs: 1_000,
        random: () => 0.5,
        timeoutMs: 60_000,
      });
      await client.init();

      await vi.advanceTimersByTimeAsync(10_000); // ten intervals pass while one request hangs
      expect(api.calls).toHaveLength(2);

      release?.();
      await vi.advanceTimersByTimeAsync(1_001);
      expect(api.calls).toHaveLength(3);
      client.close();
    });

    it('stops polling when closed, and aborts the request in flight', async () => {
      vi.useFakeTimers();
      const api = fakeApi((call) =>
        call === 1
          ? snapshotResponse(1)
          : new Promise<Response>(() => {
              /* hangs until aborted */
            }),
      );
      const client = createLocalClient({
        baseUrl: 'http://example.test',
        key: KEY,
        fetch: api.fetch,
        pollIntervalMs: 1_000,
        random: () => 0.5,
        timeoutMs: 60_000,
      });
      await client.init();
      await vi.advanceTimersByTimeAsync(1_000);
      expect(api.calls).toHaveLength(2);
      expect(api.calls[1]!.signal?.aborted).toBe(false);

      client.close();

      expect(api.calls[1]!.signal?.aborted).toBe(true);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(api.calls).toHaveLength(2);
      expect(await client.refresh()).toBe(false);
    });

    it('does not poll at all unless an interval is given', async () => {
      vi.useFakeTimers();
      const api = fakeApi(() => snapshotResponse(1));
      const client = createLocalClient({
        baseUrl: 'http://example.test',
        key: KEY,
        fetch: api.fetch,
      });
      await client.init();

      await vi.advanceTimersByTimeAsync(600_000);
      expect(api.calls).toHaveLength(1);
      client.close();
    });
  });

  describe('close', () => {
    it('keeps evaluating on the last snapshot and refuses new loads', async () => {
      const s = await serve(snapshotHandler({ flags: FLAGS, version: 1 }));
      const client = createLocalClient({ baseUrl: s.url, key: KEY });
      await client.init();

      client.close();

      expect(client.evaluate('on', {}, false)).toEqual({ value: true, reason: 'ROLLOUT_IN' });
      expect(await client.refresh()).toBe(false);
      await expect(client.init()).rejects.toMatchObject({ code: 'NETWORK' });
      expect(s.requests).toHaveLength(1);
    });
  });

  describe('options', () => {
    it.each([0, 999, -1, Number.NaN])('rejects a poll interval of %s', (interval) => {
      expect(() =>
        createLocalClient({ baseUrl: 'http://x.test', key: KEY, pollIntervalMs: interval }),
      ).toThrow('pollIntervalMs must be at least 1000');
    });

    it('accepts the minimum poll interval', () => {
      expect(() =>
        createLocalClient({ baseUrl: 'http://x.test', key: KEY, pollIntervalMs: 1000 }),
      ).not.toThrow();
    });
  });

  describe('the API key never leaks', () => {
    it('is not in any error the client throws or reports', async () => {
      const failures: FlagboardError[] = [];
      for (const status of [401, 403, 429, 500, 400]) {
        const s = await startServer((_req, res) => json(res, status, { error: 'x' }));
        const client = createLocalClient({
          baseUrl: s.url,
          key: KEY,
          onError: (e) => failures.push(e),
        });
        await client.init().catch((e: FlagboardError) => failures.push(e));
        await client.refresh();
        await s.close();
      }
      const offline = createLocalClient({ baseUrl: await closedPortUrl(), key: KEY });
      await offline.init().catch((e: FlagboardError) => failures.push(e));

      expect(failures.length).toBeGreaterThan(8);
      for (const error of failures) {
        expect(`${error.name} ${error.message} ${error.code} ${error.stack}`).not.toContain(KEY);
        expect(JSON.stringify(error)).not.toContain(KEY);
      }
      expect(JSON.stringify(offline)).not.toContain(KEY);
    });
  });
});
