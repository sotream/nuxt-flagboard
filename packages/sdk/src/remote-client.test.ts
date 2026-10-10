import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRemoteClient } from './remote-client.js';
import type { FlagboardError } from './errors.js';
import { closedPortUrl, json, startServer } from './test-support/server.js';
import type { Handler, TestServer } from './test-support/server.js';

const KEY = `fb_srv_${'K'.repeat(43)}`;
let server: TestServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

const serve = async (...args: Parameters<typeof startServer>) =>
  (server = await startServer(...args));

describe('createRemoteClient', () => {
  describe('evaluate', () => {
    it('asks the server for one flag and returns its value and reason', async () => {
      const s = await serve((_req, res) =>
        json(res, 200, { flags: { checkout: { value: 'new', reason: 'ROLLOUT_IN' } } }),
      );
      const client = createRemoteClient({ baseUrl: s.url, key: KEY });

      const result = await client.evaluate(
        'checkout',
        { userId: 'user-1', attributes: { country: 'UA' } },
        'old',
      );

      expect(result).toEqual({ value: 'new', reason: 'ROLLOUT_IN' });
      expect(s.requests).toHaveLength(1);
      expect(s.requests[0]).toMatchObject({
        method: 'POST',
        url: '/v1/evaluate',
        body: { flags: ['checkout'], context: { userId: 'user-1', attributes: { country: 'UA' } } },
      });
      expect(s.requests[0]!.headers.authorization).toBe(`Bearer ${KEY}`);
    });

    it('passes the rule index through when the server sends it', async () => {
      const s = await serve((_req, res) =>
        json(res, 200, { flags: { f: { value: true, reason: 'RULE_MATCH', ruleIndex: 2 } } }),
      );
      const result = await createRemoteClient({ baseUrl: s.url, key: KEY }).evaluate(
        'f',
        {},
        false,
      );
      expect(result).toEqual({ value: true, reason: 'RULE_MATCH', ruleIndex: 2 });
    });

    it('returns the default with FLAG_NOT_FOUND when the server does not know the flag', async () => {
      const s = await serve((_req, res) =>
        json(res, 200, { flags: { missing: { value: null, reason: 'FLAG_NOT_FOUND' } } }),
      );
      const result = await createRemoteClient({ baseUrl: s.url, key: KEY }).evaluate(
        'missing',
        {},
        'fallback',
      );
      expect(result).toEqual({ value: 'fallback', reason: 'FLAG_NOT_FOUND' });
    });

    it('treats a flag named like an Object.prototype member as an ordinary missing flag', async () => {
      const s = await serve((_req, res) => json(res, 200, { flags: {} }));
      const result = await createRemoteClient({ baseUrl: s.url, key: KEY }).evaluate(
        'constructor',
        {},
        'd',
      );
      expect(result).toEqual({ value: 'd', reason: 'FLAG_NOT_FOUND' });
    });

    it('works with a base URL that has a trailing slash or a path prefix', async () => {
      const s = await serve((_req, res) =>
        json(res, 200, { flags: { f: { value: true, reason: 'DEFAULT' } } }),
      );
      await createRemoteClient({ baseUrl: `${s.url}/`, key: KEY }).evaluate('f', {}, false);
      expect(s.requests[0]!.url).toBe('/v1/evaluate');
    });
  });

  describe('failures never throw: the default comes back with reason ERROR', () => {
    const failing: [label: string, handler: Handler, code: string][] = [
      ['a 500', (_req, res) => json(res, 500, { error: 'boom' }), 'SERVER'],
      ['a 401', (_req, res) => json(res, 401, {}), 'INVALID_KEY'],
      ['a 403', (_req, res) => json(res, 403, {}), 'FORBIDDEN'],
      ['a 429', (_req, res) => json(res, 429, {}, { 'Retry-After': '30' }), 'RATE_LIMITED'],
      ['a 400', (_req, res) => json(res, 400, {}), 'BAD_REQUEST'],
      [
        'a body that is not JSON',
        (_req, res) => {
          res.writeHead(200);
          res.end('<html>');
        },
        'BAD_RESPONSE',
      ],
      ['JSON of the wrong shape', (_req, res) => json(res, 200, { nope: true }), 'BAD_RESPONSE'],
    ];

    it.each([
      ['seconds', '30', 30_000],
      ['an HTTP-date', new Date(Date.now() + 90_000).toUTCString(), 90_000],
    ])(
      'a 429 with Retry-After in %s gives the error retryAfterMs',
      async (_label, header, expected) => {
        const s = await serve((_req, res) =>
          json(res, 429, {}, { 'Retry-After': header as string }),
        );
        const errors: FlagboardError[] = [];
        const client = createRemoteClient({
          baseUrl: s.url,
          key: KEY,
          onError: (e) => errors.push(e),
        });
        await client.evaluate('f', {}, false);
        expect(errors[0]!.code).toBe('RATE_LIMITED');
        expect(errors[0]!.retryAfterMs).toBeGreaterThan((expected as number) - 2_000);
        expect(errors[0]!.retryAfterMs).toBeLessThanOrEqual(expected as number);
      },
    );

    it('a 503 carries retryAfterMs too, and a 429 without the header has none', async () => {
      const busy = await serve((_req, res) => json(res, 503, {}, { 'Retry-After': '5' }));
      const errors: FlagboardError[] = [];
      await createRemoteClient({
        baseUrl: busy.url,
        key: KEY,
        onError: (e) => errors.push(e),
      }).evaluate('f', {}, false);
      expect(errors[0]).toMatchObject({ code: 'SERVER', status: 503, retryAfterMs: 5_000 });
      await busy.close();
      server = undefined;

      const limited = await serve((_req, res) => json(res, 429, {}));
      await createRemoteClient({
        baseUrl: limited.url,
        key: KEY,
        onError: (e) => errors.push(e),
      }).evaluate('f', {}, false);
      expect(errors[1]!.retryAfterMs).toBeUndefined();
    });

    it.each(failing)('for %s', async (_label, handler, code) => {
      const s = await serve(handler);
      const errors: FlagboardError[] = [];
      const client = createRemoteClient({
        baseUrl: s.url,
        key: KEY,
        onError: (e) => errors.push(e),
      });

      const result = await client.evaluate('f', {}, 'fallback');

      expect(result).toEqual({ value: 'fallback', reason: 'ERROR' });
      expect(errors.map((e) => e.code)).toEqual([code]);
    });

    it('when nothing listens on the address', async () => {
      const errors: FlagboardError[] = [];
      const client = createRemoteClient({
        baseUrl: await closedPortUrl(),
        key: KEY,
        onError: (e) => errors.push(e),
      });

      expect(await client.evaluate('f', {}, 'fallback')).toEqual({
        value: 'fallback',
        reason: 'ERROR',
      });
      expect(errors.map((e) => e.code)).toEqual(['NETWORK']);
    });

    it('when the server is slower than the timeout', async () => {
      const s = await serve(() => undefined); // never answers
      const errors: FlagboardError[] = [];
      const client = createRemoteClient({
        baseUrl: s.url,
        key: KEY,
        timeoutMs: 100,
        onError: (e) => errors.push(e),
      });

      const started = Date.now();
      const result = await client.evaluate('f', {}, 'fallback');

      expect(result).toEqual({ value: 'fallback', reason: 'ERROR' });
      expect(Date.now() - started).toBeLessThan(1500);
      expect(errors.map((e) => e.code)).toEqual(['TIMEOUT']);
    });

    it('uses a 2 second timeout unless told otherwise', async () => {
      vi.useFakeTimers();
      try {
        const never = vi.fn(
          (_url: unknown, init?: { signal?: AbortSignal }) =>
            new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
            }),
        );
        const client = createRemoteClient({
          baseUrl: 'http://example.test',
          key: KEY,
          fetch: never as unknown as typeof fetch,
        });

        const pending = client.evaluate('f', {}, 'd');
        await vi.advanceTimersByTimeAsync(1999);
        let settled = false;
        void pending.then(() => (settled = true));
        await vi.advanceTimersByTimeAsync(0);
        expect(settled).toBe(false);
        await vi.advanceTimersByTimeAsync(2);

        expect(await pending).toEqual({ value: 'd', reason: 'ERROR' });
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('the API key never leaks', () => {
    it('is not in any error message, any error field, or the client object', async () => {
      const failures: FlagboardError[] = [];
      for (const status of [401, 403, 429, 500, 400]) {
        const s = await startServer((req, res) =>
          json(res, status, { echo: req.headers.authorization }),
        );
        const client = createRemoteClient({
          baseUrl: s.url,
          key: KEY,
          onError: (e) => failures.push(e),
        });
        await client.evaluate('f', {}, 'd');
        await client.evaluateAll({});
        await s.close();
      }
      const offline = createRemoteClient({
        baseUrl: await closedPortUrl(),
        key: KEY,
        onError: (e) => failures.push(e),
      });
      await offline.evaluate('f', {}, 'd');

      expect(failures.length).toBeGreaterThan(8);
      for (const error of failures) {
        expect(`${error.name} ${error.message} ${error.code} ${error.stack}`).not.toContain(KEY);
        expect(JSON.stringify(error)).not.toContain(KEY);
      }
      expect(JSON.stringify(offline)).not.toContain(KEY);
      expect(Object.values(offline).join()).not.toContain(KEY);
    });

    it('is not in the error thrown for bad options', () => {
      const attempt = () => createRemoteClient({ baseUrl: 'not a url', key: KEY });
      expect(attempt).toThrow('baseUrl must be a valid URL');
      expect(() => attempt()).not.toThrow(KEY);
    });
  });

  describe('options', () => {
    it.each([
      ['a missing key', { baseUrl: 'http://x.test', key: '' }, 'An API key is required'],
      ['a blank key', { baseUrl: 'http://x.test', key: '   ' }, 'An API key is required'],
      ['a malformed URL', { baseUrl: 'nope', key: KEY }, 'valid URL'],
      ['a non-http URL', { baseUrl: 'ftp://x.test', key: KEY }, 'http or https'],
      ['a zero timeout', { baseUrl: 'http://x.test', key: KEY, timeoutMs: 0 }, 'positive'],
      ['a negative timeout', { baseUrl: 'http://x.test', key: KEY, timeoutMs: -5 }, 'positive'],
    ])('rejects %s up front', (_label, options, message) => {
      expect(() => createRemoteClient(options)).toThrow(message);
    });
  });

  describe('evaluateAll', () => {
    it('returns every flag the server sent', async () => {
      const s = await serve((_req, res) =>
        json(res, 200, {
          flags: {
            a: { value: true, reason: 'ROLLOUT_IN' },
            b: { value: 'x', reason: 'RULE_MATCH', ruleIndex: 0 },
          },
        }),
      );
      const result = await createRemoteClient({ baseUrl: s.url, key: KEY }).evaluateAll({
        userId: 'u',
      });

      expect(result).toEqual({
        a: { value: true, reason: 'ROLLOUT_IN' },
        b: { value: 'x', reason: 'RULE_MATCH', ruleIndex: 0 },
      });
      expect(s.requests[0]!.body).toEqual({ context: { userId: 'u' } });
    });

    it('returns an empty result, and reports the error, when the request fails', async () => {
      const s = await serve((_req, res) => json(res, 500, {}));
      const errors: FlagboardError[] = [];
      const result = await createRemoteClient({
        baseUrl: s.url,
        key: KEY,
        onError: (e) => errors.push(e),
      }).evaluateAll({});
      expect(result).toEqual({});
      expect(errors).toHaveLength(1);
    });
  });

  describe('close', () => {
    it('aborts a request in flight and refuses new ones', async () => {
      const s = await serve(() => undefined);
      const client = createRemoteClient({ baseUrl: s.url, key: KEY, timeoutMs: 5000 });

      const pending = client.evaluate('f', {}, 'd');
      await new Promise((resolve) => setTimeout(resolve, 50));
      client.close();

      expect(await pending).toEqual({ value: 'd', reason: 'ERROR' });
      const before = s.requests.length;
      expect(await client.evaluate('f', {}, 'd')).toEqual({ value: 'd', reason: 'ERROR' });
      expect(s.requests).toHaveLength(before);
    });
  });
});
