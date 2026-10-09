export interface SseMessage {
  /** The `event:` name; "message" when the server sent none. */
  type: string;
  data: string;
  id?: string;
}

/** Splits one line into its field name and value, removing the single space the format allows after the colon. */
function splitField(line: string): [field: string, value: string] {
  const colon = line.indexOf(':');
  if (colon === -1) return [line, ''];
  return [line.slice(0, colon), line.slice(colon + 1).replace(/^ /, '')];
}

/** Turns one block of lines (an event) into a message, or undefined for comments and blocks without data. */
function parseBlock(block: string): SseMessage | undefined {
  let type = 'message';
  let id: string | undefined;
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (line === '' || line.startsWith(':')) continue; // blank line or comment (heartbeats may use these)
    const [field, value] = splitField(line);
    if (field === 'event') type = value;
    else if (field === 'data') data.push(value);
    else if (field === 'id') id = value;
  }
  return data.length === 0 ? undefined : { type, data: data.join('\n'), id };
}

/**
 * Cuts the text received so far into complete events and the unfinished rest. Line endings may be `\n`, `\r\n` or
 * `\r`. A lone `\r` at the very end may be the first half of `\r\n`, so it waits for the next chunk, unless the
 * stream is over (`final`).
 */
function splitEvents(text: string, final: boolean): { blocks: string[]; rest: string } {
  const held = !final && text.endsWith('\r') ? '\r' : '';
  const blocks = (held ? text.slice(0, -1) : text).replace(/\r\n|\r/g, '\n').split('\n\n');
  return { blocks: blocks.slice(0, -1), rest: (blocks.at(-1) ?? '') + held };
}

/**
 * Reads a Server-Sent Events stream. `EventSource` cannot send an Authorization header, so the app reads the response
 * body itself. Handles events split across chunks (also in the middle of a multi-byte character), all three line
 * endings, several `data:` lines, and comments. An event is delivered when its blank line arrives, so a stream cut
 * off mid-event drops that half event.
 */
export async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseMessage> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (let finished = false; !finished;) {
      const { value, done } = await reader.read();
      finished = done;
      buffer += value ? decoder.decode(value, { stream: true }) : decoder.decode();
      const { blocks, rest } = splitEvents(buffer, finished);
      buffer = rest;
      for (const block of blocks) {
        const message = parseBlock(block);
        if (message) yield message;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
