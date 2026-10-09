import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../app/utils/api-error';
import { createSession } from '../../app/utils/session';
import { createFakeAuthServer, createFakeLocks } from './helpers/fake-auth';
import type { CookieJar } from './helpers/fake-auth';

/** One browser tab: its own session (own in-memory token), sharing the cookie jar with the other tabs. */
function tab(
  server: ReturnType<typeof createFakeAuthServer>,
  locks?: ReturnType<typeof createFakeLocks>,
) {
  return createSession({
    fetch: server.fetch,
    withLock: (name, callback) => (locks ? locks.request(name, callback) : callback()),
  });
}

async function signedInTab(jar: CookieJar) {
  const server = createFakeAuthServer(jar);
  const session = tab(server);
  await session.login('admin@example.com', 'correct-password');
  return { server, session };
}

describe('login and logout', () => {
  it('signs in, keeps the user in state, and stores the refresh token only in the cookie jar', async () => {
    const jar: CookieJar = { value: undefined };
    const { session } = await signedInTab(jar);

    expect(session.state).toMatchObject({
      status: 'authenticated',
      user: { email: 'admin@example.com', role: 'admin' },
    });
    expect(jar.value).toBe('refresh-1');
  });

  it('rejects a wrong password with the server message and stays signed out', async () => {
    const server = createFakeAuthServer({ value: undefined });
    const session = tab(server);

    await expect(session.login('admin@example.com', 'wrong')).rejects.toMatchObject({
      status: 401,
      message: 'Invalid email or password',
    });
    expect(session.state.status).toBe('unknown');
  });

  it('signs out and forgets the user even when the server cannot be reached', async () => {
    const jar: CookieJar = { value: undefined };
    const { session } = await signedInTab(jar);
    const offline = createSession({ fetch: () => Promise.reject(new TypeError('offline')) });
    await offline.logout().catch(() => undefined);

    await session.logout();
    expect(session.state).toMatchObject({ status: 'anonymous', user: null });
    expect(offline.state.status).toBe('anonymous');
  });
});

describe('restoring a session after a page load', () => {
  it('resumes from the refresh cookie, once, however many callers ask', async () => {
    const jar: CookieJar = { value: undefined };
    const { server } = await signedInTab(jar);
    const reloaded = tab(server); // a new page load: empty memory, cookie still in the jar

    await Promise.all([reloaded.restore(), reloaded.restore(), reloaded.restore()]);

    expect(reloaded.state.status).toBe('authenticated');
    expect(server.calls.refresh).toBe(1);
  });

  it('ends up signed out when there is no cookie', async () => {
    const session = tab(createFakeAuthServer({ value: undefined }));
    await session.restore();
    expect(session.state.status).toBe('anonymous');
  });

  it('ends up signed out, without throwing, when the server is unreachable', async () => {
    const session = createSession({ fetch: () => Promise.reject(new TypeError('offline')) });
    await expect(session.restore()).resolves.toBeUndefined();
    expect(session.state.status).toBe('anonymous');
  });
});

describe('requests', () => {
  it('sends the access token and returns the parsed body', async () => {
    const { session, server } = await signedInTab({ value: undefined });
    expect(await session.request<{ key: string }[]>('/api/v1/projects')).toEqual([{ key: 'demo' }]);
    expect(server.calls.api).toBe(1);
  });

  it('refreshes once and retries when the access token was rejected', async () => {
    const { session, server } = await signedInTab({ value: undefined });
    server.expireAccessTokens();

    expect(await session.request('/api/v1/projects')).toEqual([{ key: 'demo' }]);
    expect(server.calls.refresh).toBe(1);
    expect(session.state.status).toBe('authenticated');
  });

  it('refreshes ahead of time when the access token is about to expire', async () => {
    let now = 1_000_000;
    const jar: CookieJar = { value: undefined };
    const server = createFakeAuthServer(jar);
    const session = createSession({ fetch: server.fetch, now: () => now });
    await session.login('admin@example.com', 'correct-password');

    now += 880_000; // 20 seconds left of 900
    await session.request('/api/v1/projects');

    expect(server.calls.refresh).toBe(1);
    expect(server.calls.api).toBe(1); // no failed attempt first
  });

  it('signs the user out when the session really ended (the refresh token is gone)', async () => {
    const jar: CookieJar = { value: undefined };
    const { session, server } = await signedInTab(jar);
    server.expireAccessTokens();
    jar.value = undefined; // the cookie expired or was cleared

    await expect(session.request('/api/v1/projects')).rejects.toMatchObject({ status: 401 });
    expect(session.state).toMatchObject({ status: 'anonymous', user: null });
  });

  it('refuses to call the API when nobody is signed in', async () => {
    const session = tab(createFakeAuthServer({ value: undefined }));
    await expect(session.request('/api/v1/projects')).rejects.toBeInstanceOf(ApiError);
  });

  it('turns a failed response into an ApiError that keeps the body (a 409 carries the current state)', async () => {
    const fetcher = vi.fn(async (path: RequestInfo | URL) =>
      String(path).includes('/auth/')
        ? new Response(
            JSON.stringify({
              accessToken: 'a',
              expiresIn: 900,
              user: { id: '1', email: 'e', role: 'admin' },
            }),
            { status: 200 },
          )
        : new Response(JSON.stringify({ message: 'Changed elsewhere', current: { revision: 5 } }), {
            status: 409,
          }),
    );
    const session = createSession({ fetch: fetcher as unknown as typeof fetch });
    await session.login('e', 'p');

    const error = await session.request('/api/v1/projects').catch((e: unknown) => e as ApiError);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      message: 'Changed elsewhere',
      body: { current: { revision: 5 } },
    });
  });

  it('builds the query string from defined values only', async () => {
    const seen: string[] = [];
    const jar: CookieJar = { value: undefined };
    const server = createFakeAuthServer(jar);
    const session = createSession({
      fetch: ((input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(String(input));
        return server.fetch(input, init);
      }) as typeof fetch,
    });
    await session.login('admin@example.com', 'correct-password');

    await session.request('/api/v1/projects', {
      query: { search: 'pay', limit: 20, cursor: undefined, empty: '' },
    });

    expect(seen.at(-1)).toBe('/api/v1/projects?search=pay&limit=20');
  });
});

describe('concurrent refreshes do not log the user out', () => {
  it('in one tab: two refresh() calls share one request', async () => {
    const { session, server } = await signedInTab({ value: undefined });

    await Promise.all([session.refresh(), session.refresh()]);

    expect(server.calls.refresh).toBe(1);
    expect(session.state.status).toBe('authenticated');
  });

  it('in one tab: several requests that all hit an expired token trigger one refresh and all succeed', async () => {
    const { session, server } = await signedInTab({ value: undefined });
    server.expireAccessTokens();

    const results = await Promise.all([
      session.request('/api/v1/projects'),
      session.request('/api/v1/projects'),
      session.request('/api/v1/projects'),
    ]);

    expect(results).toHaveLength(3);
    expect(server.calls.refresh).toBe(1);
    expect(session.state.status).toBe('authenticated');
  });

  it('across tabs that hold the Web Lock in turn: both refresh, neither is signed out', async () => {
    const jar: CookieJar = { value: undefined };
    const server = createFakeAuthServer(jar);
    const locks = createFakeLocks();
    const first = tab(server, locks);
    const second = tab(server, locks);
    await first.login('admin@example.com', 'correct-password');
    await second.restore(); // the second tab loads with the same cookie

    const before = server.calls.refresh;
    await Promise.all([first.refresh(), second.refresh()]);

    expect(server.calls.refresh - before).toBe(2); // one after the other, each with the current cookie
    expect(first.state.status).toBe('authenticated');
    expect(second.state.status).toBe('authenticated');
    expect(locks.held.filter((name) => name === 'flagboard-refresh').length).toBeGreaterThanOrEqual(
      2,
    );
    await expect(first.request('/api/v1/projects')).resolves.toBeDefined();
    await expect(second.request('/api/v1/projects')).resolves.toBeDefined();
  });

  it('across tabs, many times in a row, with requests mixed in', async () => {
    const jar: CookieJar = { value: undefined };
    const server = createFakeAuthServer(jar, { latencyMs: 2 });
    const locks = createFakeLocks();
    const tabs = [tab(server, locks), tab(server, locks), tab(server, locks)];
    await tabs[0]!.login('admin@example.com', 'correct-password');
    await Promise.all(tabs.slice(1).map((t) => t.restore()));

    for (let round = 0; round < 5; round++) {
      server.expireAccessTokens();
      await Promise.all(tabs.map((t) => t.request('/api/v1/projects')));
    }

    expect(tabs.map((t) => t.state.status)).toEqual([
      'authenticated',
      'authenticated',
      'authenticated',
    ]);
  });

  it('proves the lock is what protects them: without it, two tabs refreshing together replay the cookie and are signed out', async () => {
    const jar: CookieJar = { value: undefined };
    const server = createFakeAuthServer(jar);
    const first = tab(server); // no lock provider: the fallback path, tabs are not coordinated
    const second = tab(server);
    await first.login('admin@example.com', 'correct-password');
    await second.restore();

    await Promise.allSettled([first.refresh(), second.refresh()]);

    const statuses = [first.state.status, second.state.status];
    expect(statuses).toContain('anonymous'); // the server read the second request as a replay
  });

  it('a network failure during refresh does not sign the user out', async () => {
    const jar: CookieJar = { value: undefined };
    const server = createFakeAuthServer(jar);
    let offline = false;
    const session = createSession({
      fetch: ((input: RequestInfo | URL, init?: RequestInit) =>
        offline
          ? Promise.reject(new TypeError('offline'))
          : server.fetch(input, init)) as typeof fetch,
    });
    await session.login('admin@example.com', 'correct-password');

    offline = true;
    await expect(session.refresh()).rejects.toMatchObject({ status: 0 });

    expect(session.state.status).toBe('authenticated');
  });
});
