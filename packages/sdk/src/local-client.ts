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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isAttributeValue = (value: unknown): boolean =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

const isCondition = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.attribute === 'string' &&
  ((value.operator === 'equals' && isAttributeValue(value.value)) ||
    (value.operator === 'in' &&
      Array.isArray(value.values) &&
      value.values.every(isAttributeValue)));

const isRule = (value: unknown): boolean =>
  isRecord(value) &&
  (value.serve === 'on' || value.serve === 'off') &&
  Array.isArray(value.conditions) &&
  value.conditions.every(isCondition);

/** The snapshot is data from the network: check everything `evaluate` will read, not just the top level. */
const isFlagConfig = (value: unknown): value is FlagConfig => {
  if (!isRecord(value)) return false;
  const valueType =
    value.type === 'boolean' ? 'boolean' : value.type === 'string' ? 'string' : undefined;
  return (
    typeof value.key === 'string' &&
    valueType !== undefined &&
    typeof value.onValue === valueType &&
    typeof value.offValue === valueType &&
    typeof value.salt === 'string' &&
    typeof value.enabled === 'boolean' &&
    Number.isInteger(value.rolloutPercentage) &&
    (value.rolloutPercentage as number) >= 0 &&
    (value.rolloutPercentage as number) <= 100 &&
    typeof value.killSwitch === 'boolean' &&
    Array.isArray(value.rules) &&
    value.rules.every(isRule)
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
  // Set when the API said how long to wait (Retry-After); the next poll is not earlier than this time.
  let notBefore = 0;

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
        if (error instanceof FlagboardError && error.retryAfterMs !== undefined) {
          notBefore = Date.now() + error.retryAfterMs;
        }
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
      // Never sooner than the interval, and not before the API said it would be ready (Retry-After).
      Math.max(withJitter(pollIntervalMs, random), notBefore - Date.now()),
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
      try {
        return evaluate(flags.get(flagKey), context, defaultValue);
      } catch {
        // The snapshot is validated on load, so this is bad input from the caller (for example no context at all).
        return { value: defaultValue, reason: 'ERROR' };
      }
    },

    close() {
      closed = true;
      clearTimeout(timer);
      http.close();
    },
  };
}
