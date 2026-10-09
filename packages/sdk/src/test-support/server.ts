import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface RecordedRequest {
  method: string;
  url: string;
  headers: IncomingMessage['headers'];
  body: unknown;
}

export interface TestServer {
  url: string;
  requests: RecordedRequest[];
  close: () => Promise<void>;
}

export type Handler = (request: RecordedRequest, response: ServerResponse) => void | Promise<void>;

/** A real HTTP server on an ephemeral port, so the SDK is tested through its actual `fetch`. */
export async function startServer(handler: Handler): Promise<TestServer> {
  const requests: RecordedRequest[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const text = Buffer.concat(chunks).toString();
      const recorded: RecordedRequest = {
        method: request.method ?? '',
        url: request.url ?? '',
        headers: request.headers,
        body: text ? (JSON.parse(text) as unknown) : undefined,
      };
      requests.push(recorded);
      void Promise.resolve(handler(recorded, response));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

export function json(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  response.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  response.end(JSON.stringify(body));
}

/** A URL on localhost that nothing listens on, for "connection refused". */
export async function closedPortUrl(): Promise<string> {
  const server = await startServer(() => undefined);
  const { url } = server;
  await server.close();
  return url;
}
