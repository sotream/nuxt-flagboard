import type { LockProvider } from '../../../app/utils/web-lock';

export const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** A browser's cookie jar for the refresh cookie, shared by every tab (session) that uses it. */
export interface CookieJar {
  value: string | undefined;
}

/**
 * A stand-in for the API's auth endpoints with the behaviour that matters here: refresh tokens rotate, and a token
 * that is presented after it was rotated is read as a replay and revokes the whole family (the real server does
 * the same). The cookie is read when a request is SENT and written when the response ARRIVES, as in a browser,
 * which is what makes two overlapping refreshes collide.
 */
export function createFakeAuthServer(jar: CookieJar, options: { latencyMs?: number } = {}) {
  const latency = options.latencyMs ?? 5;
  const accepted = new Set<string>(); // refresh tokens that may still be used
  const revoked = new Set<string>();
  const accessTokens = new Set<string>();
  const calls = { login: 0, refresh: 0, logout: 0, api: 0 };
  let counter = 0;
  const user = { id: 'user-1', email: 'admin@example.com', role: 'admin' as const };

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  function issue(): { accessToken: string; refreshToken: string } {
    counter += 1;
    const accessToken = `access-${counter}`;
    const refreshToken = `refresh-${counter}`;
    accessTokens.add(accessToken);
    accepted.add(refreshToken);
    return { accessToken, refreshToken };
  }

  function login(init: RequestInit): Response {
    calls.login += 1;
    const body = JSON.parse(String(init.body)) as { password: string };
    if (body.password !== 'correct-password')
      return json(401, { status: 401, detail: 'Invalid email or password' });
    const { accessToken, refreshToken } = issue();
    jar.value = refreshToken;
    return json(200, { accessToken, expiresIn: 900, user });
  }

  function refresh(sentCookie: string | undefined): Response {
    calls.refresh += 1;
    if (!sentCookie || revoked.has(sentCookie)) {
      // A replay: revoke everything, so the real holder is signed out too.
      accepted.forEach((token) => revoked.add(token));
      accepted.clear();
      return json(401, { status: 401, detail: 'Invalid refresh token' });
    }
    if (!accepted.has(sentCookie))
      return json(401, { status: 401, detail: 'Invalid refresh token' });
    accepted.delete(sentCookie);
    revoked.add(sentCookie);
    const { accessToken, refreshToken } = issue();
    jar.value = refreshToken; // written when the response arrives
    return json(200, { accessToken, expiresIn: 900, user });
  }

  function logout(): Response {
    calls.logout += 1;
    accepted.clear();
    jar.value = undefined;
    return new Response(null, { status: 204 });
  }

  function projects(authorization: string | null): Response {
    calls.api += 1;
    const token = authorization?.replace('Bearer ', '');
    if (!token || !accessTokens.has(token))
      return json(401, { status: 401, detail: 'Invalid or expired access token' });
    return json(200, [{ key: 'demo' }]);
  }

  async function handle(path: string, init: RequestInit = {}): Promise<Response> {
    const sentCookie = jar.value; // read when the request leaves
    const authorization = new Headers(init.headers).get('authorization');
    await delay(latency);
    if (path === '/api/v1/auth/login') return login(init);
    if (path === '/api/v1/auth/refresh') return refresh(sentCookie);
    if (path === '/api/v1/auth/logout') return logout();
    if (path.startsWith('/api/v1/projects')) return projects(authorization);
    return json(404, { status: 404, detail: 'not found' });
  }

  return {
    calls,
    fetch: ((input: RequestInfo | URL, init?: RequestInit) =>
      handle(String(input).split('?')[0]!, init)) as typeof fetch,
    /** Makes every access token issued so far invalid, as if 15 minutes had passed. */
    expireAccessTokens: () => accessTokens.clear(),
    isRevoked: (token: string) => revoked.has(token),
  };
}

/** An in-memory stand-in for navigator.locks: exclusive locks by name, granted in the order requested. */
export function createFakeLocks(): LockProvider & { held: string[] } {
  const queues = new Map<string, Promise<unknown>>();
  const held: string[] = [];
  return {
    held,
    request<T>(name: string, callback: () => Promise<T>): Promise<T> {
      const previous = queues.get(name) ?? Promise.resolve();
      const run = previous.then(
        () => {
          held.push(name);
          return callback();
        },
        () => callback(),
      );
      queues.set(
        name,
        run.catch(() => undefined),
      );
      return run;
    },
  };
}
