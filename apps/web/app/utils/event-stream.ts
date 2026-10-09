import { ApiError } from './api-error';
import { parseSse } from './sse';
import type { SseMessage } from './sse';

export type StreamStatus = 'connecting' | 'live' | 'reconnecting' | 'offline' | 'evicted';

export interface EventStreamOptions {
  /** Opens the stream. Called again for every reconnect. */
  open: (signal: AbortSignal) => Promise<Response>;
  onMessage: (message: SseMessage) => void;
  onStatus: (status: StreamStatus) => void;
  /** Called when a stream opens again after an earlier one ended, because events may have been missed. */
  onReconnected: () => void;
  signal: AbortSignal;
  /** Waits; replaced in tests. Rejects or resolves early when `signal` aborts. */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  now?: () => number;
}

export const FIRST_RETRY_MS = 1000;
export const MAX_RETRY_MS = 30_000;
/** A stream that lasted this long counts as healthy, so the next retry starts from the short delay again. */
export const HEALTHY_AFTER_MS = 10_000;

const defaultSleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    });
  });

/** Problems that retrying cannot fix: the session ended or the project is gone. */
const isFatal = (problem: unknown): boolean =>
  problem instanceof ApiError &&
  (problem.status === 401 || problem.status === 403 || problem.status === 404);

/**
 * Keeps one stream open until `signal` aborts. When the stream ends (the server closes it when the access token
 * expires or on a restart) or fails, it waits and opens it again, doubling the wait
 * up to 30 seconds so a struggling server is not hammered. An `evicted` event (the user opened too many tabs
 * and this stream was the oldest) ends the loop for good; the indicator tells the user.
 */
export async function runEventStream(options: EventStreamOptions): Promise<void> {
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;
  let delay = FIRST_RETRY_MS;
  let connectedBefore = false;

  /** One connection from opening to its end. Returns false when retrying is pointless. */
  async function connect(): Promise<boolean> {
    options.onStatus(connectedBefore ? 'reconnecting' : 'connecting');
    try {
      const response = await options.open(options.signal);
      if (!response.ok || !response.body) {
        throw new ApiError(response.status, `The event stream answered ${response.status}`);
      }
      if (connectedBefore) options.onReconnected();
      connectedBefore = true;
      options.onStatus('live');
      for await (const message of parseSse(response.body)) {
        if (message.type === 'evicted') {
          // The server closed this stream to make room for a newer tab. Reconnecting would evict another tab.
          options.onStatus('evicted');
          return false;
        }
        options.onMessage(message);
      }
    } catch (problem) {
      if (isFatal(problem)) {
        options.onStatus('offline');
        return false;
      }
    }
    return true;
  }

  while (!options.signal.aborted) {
    const startedAt = now();
    const retry = await connect();
    if (!retry || options.signal.aborted) return;
    if (now() - startedAt >= HEALTHY_AFTER_MS) delay = FIRST_RETRY_MS;
    options.onStatus('reconnecting');
    await sleep(delay, options.signal);
    delay = Math.min(delay * 2, MAX_RETRY_MS);
  }
}
