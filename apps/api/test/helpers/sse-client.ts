import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';

export interface SseEvent {
  type: string;
  data: unknown;
}

export interface SseConnection {
  status: number;
  headers: Headers;
  events: SseEvent[];
  /** Resolves with the first event matching `predicate`, or rejects after `timeoutMs`. */
  waitFor: (predicate: (event: SseEvent) => boolean, timeoutMs?: number) => Promise<SseEvent>;
  /** Resolves true when the server ended the stream, false if it is still open after `timeoutMs`. */
  endedWithin: (timeoutMs: number) => Promise<boolean>;
  close: () => void;
}

/** Reads a Server-Sent Events stream with fetch, the way the web app does (EventSource cannot send headers). */
export async function openStream(
  app: INestApplication,
  path: string,
  token?: string,
): Promise<SseConnection> {
  const { port } = app.getHttpServer().address() as AddressInfo;
  const controller = new AbortController();
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' } : {},
    signal: controller.signal,
  });
  const events: SseEvent[] = [];
  let ended = false;
  const waiters: (() => void)[] = [];
  const notify = () => waiters.splice(0).forEach((wake) => wake());

  const reading = (async () => {
    if (!response.body || response.status !== 200) {
      ended = true;
      return;
    }
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        let boundary: number;
        while ((boundary = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const type = /^event: (.*)$/m.exec(block)?.[1] ?? 'message';
          const raw = /^data: (.*)$/m.exec(block)?.[1];
          events.push({ type, data: raw ? JSON.parse(raw) : undefined });
          notify();
        }
      }
    } catch {
      // aborted by close()
    } finally {
      ended = true;
      notify();
    }
  })();

  const waitFor = async (predicate: (event: SseEvent) => boolean, timeoutMs = 3000) => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = events.find(predicate);
      if (found) return found;
      const left = deadline - Date.now();
      if (left <= 0)
        throw new Error(`No matching event within ${timeoutMs} ms; got ${JSON.stringify(events)}`);
      await new Promise<void>((resolve) => {
        waiters.push(resolve);
        setTimeout(resolve, left);
      });
    }
  };

  return {
    status: response.status,
    headers: response.headers,
    events,
    waitFor,
    endedWithin: async (timeoutMs) => {
      const deadline = Date.now() + timeoutMs;
      while (!ended && Date.now() < deadline) {
        await new Promise<void>((resolve) => {
          waiters.push(resolve);
          setTimeout(resolve, 50);
        });
      }
      return ended;
    },
    close: () => {
      controller.abort();
      void reading;
    },
  };
}
