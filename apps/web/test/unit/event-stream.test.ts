import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../app/utils/api-error';
import {
  FIRST_RETRY_MS,
  HEALTHY_AFTER_MS,
  MAX_RETRY_MS,
  runEventStream,
} from '../../app/utils/event-stream';
import type { StreamStatus } from '../../app/utils/event-stream';
import type { SseMessage } from '../../app/utils/sse';

const sse = (...events: string[]): Response =>
  new Response(events.map((e) => `${e}\n\n`).join(''), {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });

/** Runs the loop with a scripted sequence of responses; stops (aborts) after the script runs out. */
async function run(
  script: (Response | Error | (() => Response))[],
  extra: { clock?: () => number } = {},
) {
  const controller = new AbortController();
  const statuses: StreamStatus[] = [];
  const messages: SseMessage[] = [];
  const sleeps: number[] = [];
  const reconnected = vi.fn();
  let call = 0;
  await runEventStream({
    signal: controller.signal,
    open: async () => {
      const next = script[call++];
      if (next === undefined) {
        controller.abort();
        throw new Error('script finished');
      }
      if (next instanceof Error) throw next;
      return typeof next === 'function' ? next() : next;
    },
    onMessage: (m) => messages.push(m),
    onStatus: (s) => statuses.push(s),
    onReconnected: reconnected,
    sleep: async (ms) => void sleeps.push(ms),
    now: extra.clock,
  });
  return { statuses, messages, sleeps, reconnected, calls: call };
}

describe('runEventStream', () => {
  it('connects, reports live, and hands over every message', async () => {
    const { statuses, messages } = await run([
      sse('event: ready\ndata: {}', 'event: flag.changed\ndata: {"flagKey":"a"}'),
    ]);

    expect(statuses.slice(0, 2)).toEqual(['connecting', 'live']);
    expect(messages.map((m) => m.type)).toEqual(['ready', 'flag.changed']);
  });

  it('reconnects when the server ends the stream, and tells the page events may have been missed', async () => {
    const { statuses, reconnected, calls } = await run([sse('data: 1'), sse('data: 2')]);

    expect(calls).toBe(3); // the third call finds the script finished
    expect(statuses).toContain('reconnecting');
    expect(reconnected).toHaveBeenCalledTimes(1); // only the second connection counts as a reconnect
  });

  it('does not call onReconnected for the first connection', async () => {
    const { reconnected } = await run([sse('data: 1')]);
    expect(reconnected).not.toHaveBeenCalled();
  });

  it('retries after a network failure or a server error, with a growing wait', async () => {
    const { sleeps, statuses } = await run([
      new TypeError('offline'),
      new Response('x', { status: 500 }),
      new TypeError('offline'),
    ]);

    expect(sleeps).toEqual([FIRST_RETRY_MS, FIRST_RETRY_MS * 2, FIRST_RETRY_MS * 4]);
    expect(statuses.filter((s) => s === 'reconnecting').length).toBeGreaterThan(0);
  });

  it('never waits longer than the maximum', async () => {
    const failures = Array.from({ length: 12 }, () => new TypeError('offline'));
    const { sleeps } = await run(failures);
    expect(Math.max(...sleeps)).toBe(MAX_RETRY_MS);
    expect(sleeps.at(-1)).toBe(MAX_RETRY_MS);
  });

  it('starts from the short wait again after a stream that stayed open long enough', async () => {
    let time = 0;
    const longLived = () => {
      time += HEALTHY_AFTER_MS + 1; // this stream "lasted" long enough
      return sse('data: x');
    };
    const { sleeps } = await run(
      [new TypeError('x'), new TypeError('x'), longLived, new TypeError('x')],
      { clock: () => time },
    );

    expect(sleeps.slice(0, 3)).toEqual([FIRST_RETRY_MS, FIRST_RETRY_MS * 2, FIRST_RETRY_MS]);
  });

  it('keeps the wait growing when streams keep ending quickly, for example when evicted by too many open tabs', async () => {
    const { sleeps } = await run([sse('data: 1'), sse('data: 1'), sse('data: 1')]);
    expect(sleeps).toEqual([FIRST_RETRY_MS, FIRST_RETRY_MS * 2, FIRST_RETRY_MS * 4]);
  });

  it.each([401, 403, 404])('stops for good on a %i, which retrying cannot fix', async (status) => {
    const { statuses, calls } = await run([new ApiError(status, 'no'), sse('data: never reached')]);
    expect(statuses.at(-1)).toBe('offline');
    expect(calls).toBe(1);
  });

  it('stops for good when the server answers with a fatal status', async () => {
    const { statuses, calls } = await run([new Response('nope', { status: 404 })]);
    expect(statuses.at(-1)).toBe('offline');
    expect(calls).toBe(1);
  });

  it('stops quietly when asked to, without waiting or reporting offline', async () => {
    const controller = new AbortController();
    const statuses: StreamStatus[] = [];
    await runEventStream({
      signal: controller.signal,
      open: async () => {
        controller.abort();
        throw new TypeError('aborted');
      },
      onMessage: () => undefined,
      onStatus: (s) => statuses.push(s),
      onReconnected: () => undefined,
      sleep: async () => {
        throw new Error('must not sleep after an abort');
      },
    });
    expect(statuses).toEqual(['connecting']);
  });

  it('really waits (and wakes up) with the default sleep, and is cut short by an abort', async () => {
    const controller = new AbortController();
    let opened = 0;
    const done = runEventStream({
      signal: controller.signal,
      open: async () => {
        opened += 1;
        throw new TypeError('offline');
      },
      onMessage: () => undefined,
      onStatus: () => undefined,
      onReconnected: () => undefined,
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    controller.abort(); // during the 1 s wait
    await done;
    expect(opened).toBe(1);
  });
});
