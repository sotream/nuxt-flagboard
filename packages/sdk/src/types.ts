import type { Context, EvaluationResult, FlagValue } from '@flagboard/core';
import type { FlagboardError } from './errors.js';

export type { Context, EvaluationResult, FlagValue };

export interface ClientOptions {
  /** Where the Flagboard API lives, for example `https://flags.example.com`. */
  baseUrl: string;
  /** An environment API key: `fb_srv_...` or `fb_cli_...`. It is only ever sent in the Authorization header. */
  key: string;
  /** How long to wait for one request before giving up. Default 2000. */
  timeoutMs?: number;
  /** Called with every failure the SDK handled for you (for logging or metrics). */
  onError?: (error: FlagboardError) => void;
  /** Replaces the global `fetch`, mainly for tests. */
  fetch?: typeof fetch;
}

export interface LocalClientOptions extends ClientOptions {
  /** How often to check for a new snapshot, in milliseconds. Omit it to refresh only when you call `refresh()`. */
  pollIntervalMs?: number;
  /** Source of randomness for polling jitter, `Math.random` by default. Replaced in tests. */
  random?: () => number;
}
