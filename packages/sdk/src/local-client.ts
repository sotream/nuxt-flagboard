import { evaluate } from '@flagboard/core';
import type { Context, EvaluationResult, FlagConfig, FlagValue } from '@flagboard/core';
import { FlagboardError } from './errors.js';
import { HttpClient, parseJson, resolveOptions } from './http.js';
import { withJitter } from './jitter.js';
import type { LocalClientOptions } from './types.js';

/** Polling faster than this is refused: it would hammer the API for no benefit. */
export const MIN_POLL_INTERVAL_MS = 1000;

export interface LocalClient {
  /**
   * Loads the first snapshot and starts polling if `pollIntervalMs` is set. This is the one call that throws: a
   * wrong key, a client key or an unreachable API should stop your startup, not surface later as silent defaults.
   */
  init(): Promise<void>;
  /**
   * Checks for a newer snapshot (sending the last ETag, so an unchanged one costs a 304). Resolves true when the
   * flags changed. Never throws: if the request fails the last snapshot stays in use and `onError` is called.
   */
  refresh(): Promise<boolean>;
  /** Evaluates in memory with the same function the server uses. Synchronous and never throws. */
  evaluate(flagKey: string, context: Context, defaultValue: FlagValue): EvaluationResult;
  /** Stops polling and cancels requests in flight. `evaluate` keeps working on the last snapshot. */
  close(): void;
}

const isFlagConfig = (value: unknown): value is FlagConfig => {
  if (typeof value !== 'object' || value === null) return false;
  const flag = value as Record<string, unknown>;
  return (
    typeof flag.key === 'string' &&
    (flag.type === 'boolean' || flag.type === 'string') &&
    typeof flag.salt === 'string' &&
    typeof flag.enabled === 'boolean' &&
    typeof flag.rolloutPercentage === 'number' &&
    typeof flag.killSwitch === 'boolean' &&
    Array.isArray(flag.rules)
  );
};

function parseSnapshot(text: string): Map<string, FlagConfig> {
  const parsed = parseJson(text) as { flags?: unknown } | null;
  if (!parsed || !Array.isArray(parsed.flags) || !parsed.flags.every(isFlagConfig)) {
    throw new FlagboardError('BAD_RESPONSE', 'The snapshot has an unexpected shape');
  }
  return new Map(parsed.flags.map((flag) => [flag.key, flag]));
}

/**
 * Evaluates locally from a snapshot of the environment, fetched with `GET /v1/snapshot` (server keys only). The
 * attributes you pass to `evaluate` never leave your process. Use it on servers.
 */
export function createLocalClient(options: LocalClientOptions): LocalClient {
  const { baseUrl, key, timeoutMs } = resolveOptions(options);
  const { pollIntervalMs } = options;
  if (pollIntervalMs !== undefined && !(pollIntervalMs >= MIN_POLL_INTERVAL_MS)) {
    throw new FlagboardError(
      'BAD_CONFIG',
      `pollIntervalMs must be at least ${MIN_POLL_INTERVAL_MS}`,
    );
  }
  const http = new HttpClient(baseUrl, key, timeoutMs, options.fetch ?? fetch);
  const random = options.random ?? Math.random;

  let flags: Map<string, FlagConfig> | undefined;
  let etag: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  let refreshing: Promise<boolean> | undefined;

  /** Fetches the snapshot. Returns true if it changed, false on 304. Throws FlagboardError. */
  async function load(): Promise<boolean> {
    let result;
    try {
      result = await http.send('GET', '/v1/snapshot', {
        headers: etag ? { 'If-None-Match': etag } : undefined,
        accept: [304],
      });
    } catch (error) {
      if (error instanceof FlagboardError && error.code === 'FORBIDDEN') {
        throw new FlagboardError(
          'FORBIDDEN',
          'Local evaluation needs a server key (fb_srv_...). A client key can only evaluate on the server: use createRemoteClient.',
          error.status,
        );
      }
      throw error;
    }
    if (result.status === 304) {
      return false;
    }
    flags = parseSnapshot(result.text);
    etag = result.headers.get('etag') ?? undefined;
    return true;
  }

  const report = (error: unknown): void => {
    if (error instanceof FlagboardError) options.onError?.(error);
  };

  function refresh(): Promise<boolean> {
    if (closed) return Promise.resolve(false);
    // A poll and a manual refresh at the same moment share one request.
    refreshing ??= load()
      .catch((error: unknown) => {
        report(error);
        return false;
      })
      .finally(() => {
        refreshing = undefined;
      });
    return refreshing;
  }

  function schedule(): void {
    if (closed || pollIntervalMs === undefined) return;
    timer = setTimeout(
      () => {
        // The next poll is only scheduled once this one finished, so a slow API never piles up requests.
        void refresh().finally(schedule);
      },
      withJitter(pollIntervalMs, random),
    );
    (timer as { unref?: () => void }).unref?.(); // polling alone must not keep a Node process alive
  }

  return {
    async init() {
      if (closed) throw new FlagboardError('NETWORK', 'The client is closed');
      await load();
      clearTimeout(timer);
      schedule();
    },

    refresh,

    evaluate(flagKey, context, defaultValue) {
      if (!flags) {
        return { value: defaultValue, reason: 'ERROR' };
      }
      return evaluate(flags.get(flagKey), context, defaultValue);
    },

    close() {
      closed = true;
      clearTimeout(timer);
      http.close();
    },
  };
}
