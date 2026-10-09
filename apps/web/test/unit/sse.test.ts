import { describe, expect, it } from 'vitest';
import { parseSse } from '../../app/utils/sse';
import type { SseMessage } from '../../app/utils/sse';

/** A stream that delivers the given chunks (strings or raw bytes) one by one. */
function streamOf(...chunks: (string | Uint8Array)[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks)
        controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk);
      controller.close();
    },
  });
}
async function read(stream: ReadableStream<Uint8Array>): Promise<SseMessage[]> {
  const messages: SseMessage[] = [];
  for await (const message of parseSse(stream)) messages.push(message);
  return messages;
}

describe('parseSse', () => {
  it('reads the events the API sends', async () => {
    const messages = await read(
      streamOf(
        'event: ready\nid: 1\ndata: {}\n\nevent: flag.changed\nid: 2\ndata: {"flagKey":"a","revision":3}\n\n',
      ),
    );
    expect(messages).toEqual([
      { type: 'ready', data: '{}', id: '1' },
      { type: 'flag.changed', data: '{"flagKey":"a","revision":3}', id: '2' },
    ]);
  });

  it('uses "message" when no event name is given', async () => {
    expect(await read(streamOf('data: hello\n\n'))).toEqual([
      { type: 'message', data: 'hello', id: undefined },
    ]);
  });

  it('joins several data lines with newlines', async () => {
    expect((await read(streamOf('data: one\ndata: two\n\n')))[0]!.data).toBe('one\ntwo');
  });

  it('ignores comments and events without data', async () => {
    const messages = await read(streamOf(': keep-alive\n\nevent: noise\n\ndata: x\n\n'));
    expect(messages.map((m) => m.data)).toEqual(['x']);
  });

  it('removes only one leading space after the colon', async () => {
    expect((await read(streamOf('data:  two spaces\n\n')))[0]!.data).toBe(' two spaces');
    expect((await read(streamOf('data:none\n\n')))[0]!.data).toBe('none');
  });

  it('handles an event split across chunks, even in the middle of a word or a blank line', async () => {
    const messages = await read(
      streamOf('event: flag.cha', 'nged\ndata: {"a"', ':1}\n', '\nevent: x\ndata: y\n', '\n'),
    );
    expect(messages).toEqual([
      { type: 'flag.changed', data: '{"a":1}', id: undefined },
      { type: 'x', data: 'y', id: undefined },
    ]);
  });

  it.each([
    ['CRLF', 'data: a\r\n\r\ndata: b\r\n\r\n'],
    ['CR', 'data: a\r\rdata: b\r\r'],
    ['LF', 'data: a\n\ndata: b\n\n'],
  ])('handles %s line endings', async (_label, text) => {
    expect((await read(streamOf(text))).map((m) => m.data)).toEqual(['a', 'b']);
  });

  it('handles a CRLF cut between the CR and the LF', async () => {
    const messages = await read(streamOf('data: a\r', '\n\r', '\ndata: b\r\n\r\n'));
    expect(messages.map((m) => m.data)).toEqual(['a', 'b']);
  });

  it('handles a multi-byte character cut across two chunks', async () => {
    const bytes = new TextEncoder().encode('data: привіт 😀\n\n');
    const cut = 9; // inside the Cyrillic text
    const messages = await read(streamOf(bytes.slice(0, cut), bytes.slice(cut)));
    expect(messages[0]!.data).toBe('привіт 😀');
  });

  it('drops an event that was cut off before its blank line', async () => {
    const messages = await read(streamOf('data: complete\n\ndata: cut off'));
    expect(messages.map((m) => m.data)).toEqual(['complete']);
  });

  it('ends when the stream ends, and handles an empty stream', async () => {
    expect(await read(streamOf())).toEqual([]);
  });
});
