import { FlagboardError } from './errors.js';
import { parseRetryAfter } from './retry-after.js';
import type { ClientOptions } from './types.js';

export const DEFAULT_TIMEOUT_MS = 2000;

export interface HttpResult {
  status: number;
  headers: Headers;
  text: string;
}

/** Checks the options shared by both clients and returns the normalised values. Never echoes the key. */
export function resolveOptions(options: ClientOptions): {
  baseUrl: string;
  key: string;
  timeoutMs: number;
} {
  if (typeof options.key !== 'string' || options.key.trim() === '') {
    throw new FlagboardError('BAD_CONFIG', 'An API key is required');
  }
  let baseUrl: URL;
  try {
    baseUrl = new URL(options.baseUrl);
  } catch {
    throw new FlagboardError('BAD_CONFIG', 'baseUrl must be a valid URL');
  }
  if (baseUrl.protocol !== 'http:' && baseUrl.protocol !== 'https:') {
    throw new FlagboardError('BAD_CONFIG', 'baseUrl must use http or https');
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new FlagboardError('BAD_CONFIG', 'timeoutMs must be a positive number');
  }
  return {
    baseUrl: baseUrl.origin + baseUrl.pathname.replace(/\/+$/, ''),
    key: options.key.trim(),
    timeoutMs,
  };
}

/**
 * One place for sending requests: adds the key, enforces the timeout, can abort everything that is in flight,
 * and turns every failure into a `FlagboardError` that does not contain the key.
 */
export class HttpClient {
  private readonly inFlight = new Set<AbortController>();
  private closed = false;

  constructor(
    private readonly baseUrl: string,
    private readonly key: string,
    private readonly timeoutMs: number,
    private readonly fetchImpl: typeof fetch,
  ) {}

  /** Aborts every request in flight and refuses new ones. */
  close(): void {
    this.closed = true;
    for (const controller of this.inFlight) controller.abort();
    this.inFlight.clear();
  }

  /**
   * Sends a request. Resolves for 2xx and for the statuses listed in `accept` (such as 304); every other
   * outcome rejects with a `FlagboardError`.
   */
  async send(
    method: 'GET' | 'POST',
    path: string,
    options: { headers?: Record<string, string>; body?: unknown; accept?: number[] } = {},
  ): Promise<HttpResult> {
    if (this.closed) {
      throw new FlagboardError('NETWORK', 'The client is closed');
    }
    const controller = new AbortController();
    this.inFlight.add(controller);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.key}`,
          Accept: 'application/json',
          ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...options.headers,
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });
      const text = await response.text();
      const result: HttpResult = { status: response.status, headers: response.headers, text };
      if (response.ok || options.accept?.includes(response.status)) {
        return result;
      }
      throw this.errorForStatus(result);
    } catch (error) {
      throw this.toFlagboardError(error, timedOut);
    } finally {
      clearTimeout(timer);
      this.inFlight.delete(controller);
    }
  }

  private toFlagboardError(error: unknown, timedOut: boolean): FlagboardError {
    if (error instanceof FlagboardError) return error;
    if (timedOut) {
      return new FlagboardError(
        'TIMEOUT',
        `The request did not finish within ${this.timeoutMs} ms`,
      );
    }
    if (this.closed) {
      return new FlagboardError('NETWORK', 'The client was closed');
    }
    // The underlying message (for example "fetch failed") is dropped on purpose: the SDK writes its own.
    return new FlagboardError('NETWORK', 'Could not reach the Flagboard API');
  }

  private errorForStatus({ status, headers }: HttpResult): FlagboardError {
    if (status === 401) {
      return new FlagboardError(
        'INVALID_KEY',
        'The API key was rejected (unknown or revoked)',
        status,
      );
    }
    if (status === 403) {
      return new FlagboardError(
        'FORBIDDEN',
        'This kind of API key cannot call this endpoint',
        status,
      );
    }
    if (status === 429 || status === 503) {
      const retryAfterMs = parseRetryAfter(headers.get('retry-after'), Date.now());
      if (status === 503) {
        return new FlagboardError(
          'SERVER',
          `The Flagboard API failed with status ${status}`,
          status,
          retryAfterMs,
        );
      }
      const suffix =
        retryAfterMs === undefined ? '' : ` Retry after ${Math.ceil(retryAfterMs / 1000)} s.`;
      return new FlagboardError(
        'RATE_LIMITED',
        `Too many requests.${suffix}`,
        status,
        retryAfterMs,
      );
    }
    if (status >= 500) {
      return new FlagboardError('SERVER', `The Flagboard API failed with status ${status}`, status);
    }
    return new FlagboardError(
      'BAD_REQUEST',
      `The Flagboard API rejected the request with status ${status}`,
      status,
    );
  }
}

/** Parses a JSON body, or fails with a BAD_RESPONSE that says nothing about the content. */
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new FlagboardError(
      'BAD_RESPONSE',
      'The Flagboard API returned something that is not JSON',
    );
  }
}
