import { DataSource } from 'typeorm';
import { createTestApp } from './helpers/test-app.js';
import { startSession } from './helpers/api-session.js';
import { openStream } from './helpers/sse-client.js';

describe('GET /health', () => {
  it('answers ok without a token while the database is reachable', async () => {
    const t = await createTestApp();
    try {
      const response = await t.http.get('/health').expect(200);
      expect(response.body).toEqual({ status: 'ok' });
    } finally {
      await t.close();
    }
  });

  it('answers a bare 503 when the database does not respond', async () => {
    const t = await createTestApp();
    try {
      const failing = vi
        .spyOn(t.app.get(DataSource), 'query')
        .mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432 password=hunter2'));

      const response = await t.http.get('/health').expect(503);

      expect(response.body).toEqual({ status: 'error' });
      expect(JSON.stringify(response.body)).not.toContain('hunter2');
      failing.mockRestore();
    } finally {
      await t.close();
    }
  });
});

describe('graceful shutdown', () => {
  // Closing waits for idle keep-alive connections to time out (a few seconds), so this test gets a longer timeout.
  it('ends open event streams at once instead of waiting for clients that never disconnect', async () => {
    const s = await startSession();
    const { key } = await s.newProject();
    const stream = await openStream(s.t.app, `/api/v1/projects/${key}/events`, s.adminToken);
    await stream.waitFor((event) => event.type === 'ready');

    const closing = s.t.close();

    expect(await stream.endedWithin(1000)).toBe(true);
    await closing;
  }, 20_000);
});
