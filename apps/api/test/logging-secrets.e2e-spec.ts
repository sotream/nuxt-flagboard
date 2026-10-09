import fs from 'node:fs';
import { createApiKey, startSession } from './helpers/api-session.js';
import { WEB_ORIGIN } from './helpers/test-app.js';

/**
 * Boots the application with debug logging, sends real traffic that carries credentials, and checks that none of
 * them, and nothing from the rest of the process environment, ends up in the log output.
 */
describe('log output', () => {
  it('never contains passwords, tokens, API keys, cookies or unrelated environment secrets', async () => {
    const captured: string[] = [];
    const record = (chunk: unknown) =>
      captured.push(typeof chunk === 'string' ? chunk : String(chunk));
    // pino writes to fd 1 with fs.writeSync; Nest's own logger and console use the stream objects.
    const writeSync = vi.spyOn(fs, 'writeSync').mockImplementation(((
      _fd: number,
      data: unknown,
    ) => {
      record(data);
      return String(data).length;
    }) as typeof fs.writeSync);
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
      record(chunk);
      return true;
    }) as typeof process.stdout.write);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: unknown) => {
      record(chunk);
      return true;
    }) as typeof process.stderr.write);
    const unrelated = 'UNRELATED-ENV-SECRET-7f3a9c1e';
    process.env.UNRELATED_SECRET_FOR_TEST = unrelated;

    let s: Awaited<ReturnType<typeof startSession>> | undefined;
    try {
      s = await startSession({ LOG_LEVEL: 'debug' });
      const project = await s.newProject();
      const apiKey = (await createApiKey(s, project.key, 'server')).key;
      const login = await s.t.http
        .post('/api/v1/auth/login')
        .set('Origin', WEB_ORIGIN)
        .send({ email: s.admin.email, password: s.admin.password })
        .expect(200);
      const cookie = (login.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
      await s.t.http.get('/api/v1/projects').set(s.as(login.body.accessToken)).expect(200);
      await s.t.http
        .post('/api/v1/auth/refresh')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .expect(200);
      await s.t.http
        .post('/v1/evaluate')
        .set({ Authorization: `Bearer ${apiKey}` })
        .send({})
        .expect(200);
      await s.t.http
        .post('/v1/evaluate')
        .set({ Authorization: 'Bearer fb_srv_' + 'B'.repeat(43) })
        .send({})
        .expect(401);

      const output = captured.join('');
      const secrets: [string, string][] = [
        ['the sign-in password', s.admin.password],
        ['the JWT signing secret', process.env.JWT_ACCESS_SECRET!],
        ['the database password', new URL(process.env.DATABASE_URL!).password],
        ['the access token', login.body.accessToken],
        ['the refresh cookie value', cookie.split('=')[1]!],
        ['the API key', apiKey],
        ['the rejected API key', 'B'.repeat(43)],
        ['an unrelated environment variable', unrelated],
      ];
      for (const [label, value] of secrets) {
        expect(output.includes(value), `${label} appeared in the log output`).toBe(false);
      }
      // The test only means something if requests were logged and the sensitive headers were censored.
      expect(output).toContain('request completed');
      expect(output).toContain('[Redacted]');
    } finally {
      await s?.t.close();
      writeSync.mockRestore();
      stdout.mockRestore();
      stderr.mockRestore();
      delete process.env.UNRELATED_SECRET_FOR_TEST;
    }
  });
});
