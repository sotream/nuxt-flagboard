import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { createTestApp } from './helpers/test-app.js';
import type { TestApp } from './helpers/test-app.js';

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});

afterAll(async () => {
  await t.close();
});

// The tests talk to the app on 127.0.0.1. If the app listened on the wildcard address instead, another program that
// already listens on 127.0.0.1 with the same (random) port would answer those requests, not the app: the kernel
// allows both. That made a full run fail now and then with a status the API never sends, such as 503, in a
// `beforeAll` (see docs/guides/testing.md).
describe('the port of the test application', () => {
  it('is on the loopback address only', () => {
    const address = t.app.getHttpServer().address() as AddressInfo;
    expect(address.address).toBe('127.0.0.1');
  });

  it('cannot be shared: nothing else can listen on the same address and port, so nothing else can answer', async () => {
    const { port } = t.app.getHttpServer().address() as AddressInfo;
    const intruder = createServer();
    const error = await new Promise<NodeJS.ErrnoException>((resolve, reject) => {
      intruder.once('error', resolve);
      intruder.listen(port, '127.0.0.1', () =>
        reject(new Error('a second listener was allowed on the same port')),
      );
    });
    expect(error.code).toBe('EADDRINUSE');
    intruder.close();
  });

  it('answers with its own responses', async () => {
    const response = await t.http.get('/health').expect(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(t.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });
});
