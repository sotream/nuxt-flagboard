import { reactive } from 'vue';
import { ApiError } from './api-error';
import { withLock } from './web-lock';

export type Role = 'admin' | 'viewer';

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
}

interface AuthResponse {
  accessToken: string;
  /** Seconds. */
  expiresIn: number;
  user: SessionUser;
}

export interface SessionDeps {
  fetch: typeof fetch;
  /** Replaced in tests to simulate other tabs. */
  withLock?: typeof withLock;
  now?: () => number;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

export const REFRESH_LOCK = 'flagboard-refresh';
/** Refresh a little before the access token expires, so requests rarely need a retry. */
const EXPIRY_MARGIN_MS = 30_000;
const AUTH = '/api/v1/auth';

/**
 * The browser side of auth. The access token lives only in this closure (never in storage), the refresh token is an
 * httpOnly cookie the page cannot read, and every call to the API goes through `request`.
 *
 * Refreshing is shared: concurrent callers in one tab wait for a single request, and across tabs a Web Lock lets
 * one refresh run at a time, so rotating the refresh token never looks like a replay to the server.
 */
export function createSession(deps: SessionDeps) {
  const lock = deps.withLock ?? withLock;
  const now = deps.now ?? Date.now;
  const state = reactive<{
    user: SessionUser | null;
    status: 'unknown' | 'authenticated' | 'anonymous';
  }>({
    user: null,
    status: 'unknown',
  });
  let token: string | null = null;
  let expiresAt = 0;
  let refreshing: Promise<void> | undefined;
  let restoring: Promise<void> | undefined;

  function apply(auth: AuthResponse): void {
    token = auth.accessToken;
    expiresAt = now() + auth.expiresIn * 1000;
    state.user = auth.user;
    state.status = 'authenticated';
  }

  function clear(): void {
    token = null;
    expiresAt = 0;
    state.user = null;
    state.status = 'anonymous';
  }

  async function send(path: string, init: RequestInit): Promise<Response> {
    try {
      return await deps.fetch(path, init);
    } catch {
      throw ApiError.network();
    }
  }

  async function refreshOnce(): Promise<void> {
    const response = await send(`${AUTH}/refresh`, { method: 'POST' });
    if (response.status === 401) {
      clear();
      throw new ApiError(401, 'Your session has ended. Sign in again.');
    }
    if (!response.ok) {
      throw await ApiError.fromResponse(response);
    }
    apply((await response.json()) as AuthResponse);
  }

  /** One refresh at a time in this tab, and one at a time across tabs. */
  function refresh(): Promise<void> {
    refreshing ??= lock(REFRESH_LOCK, refreshOnce).finally(() => {
      refreshing = undefined;
    });
    return refreshing;
  }

  /** Tries to resume a session from the refresh cookie, once. Never throws. */
  function restore(): Promise<void> {
    restoring ??= refresh()
      .catch(() => undefined) // not signed in, or the server is unreachable: show the sign-in page
      .finally(() => {
        if (state.status === 'unknown') state.status = 'anonymous';
      });
    return restoring;
  }

  async function ensureToken(): Promise<void> {
    if (state.status === 'unknown') await restore();
    if (state.status !== 'authenticated') throw new ApiError(401, 'You are not signed in.');
    if (expiresAt - now() < EXPIRY_MARGIN_MS) await refresh();
  }

  /** `fetch` with the access token attached; on a 401 it refreshes once and retries once. */
  async function authorizedFetch(path: string, init: RequestInit = {}): Promise<Response> {
    await ensureToken();
    const attempt = () =>
      send(path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
    let response = await attempt();
    if (response.status === 401) {
      await refresh();
      response = await attempt();
      if (response.status === 401) {
        clear();
        throw new ApiError(401, 'Your session has ended. Sign in again.');
      }
    }
    return response;
  }

  async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const query = Object.entries(options.query ?? {}).filter(
      ([, value]) => value !== undefined && value !== '',
    );
    const url =
      query.length > 0
        ? `${path}?${new URLSearchParams(query.map(([k, v]) => [k, String(v)]))}`
        : path;
    const response = await authorizedFetch(url, {
      method: options.method ?? 'GET',
      headers: options.body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    if (!response.ok) {
      throw await ApiError.fromResponse(response);
    }
    return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
  }

  async function login(email: string, password: string): Promise<void> {
    const response = await send(`${AUTH}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      throw await ApiError.fromResponse(response);
    }
    apply((await response.json()) as AuthResponse);
  }

  async function logout(): Promise<void> {
    try {
      await send(`${AUTH}/logout`, { method: 'POST' });
    } finally {
      clear();
    }
  }

  return { state, login, logout, restore, refresh, request, authorizedFetch };
}

export type Session = ReturnType<typeof createSession>;
