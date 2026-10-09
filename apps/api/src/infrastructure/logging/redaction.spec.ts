import { Writable } from 'node:stream';
import pino from 'pino';
import { REDACT_PATHS, REDACTED } from './redaction.js';

function logLine(payload: Record<string, unknown>): string {
  let line = '';
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      line += chunk.toString();
      done();
    },
  });
  pino({ redact: { paths: REDACT_PATHS, censor: REDACTED } }, stream).info(payload);
  return line;
}

describe('log redaction', () => {
  it('hides the Authorization header, cookies and API key headers', () => {
    const line = logLine({
      req: {
        headers: {
          authorization: 'Bearer fb_srv_secret-key',
          cookie: 'refresh_token=secret-cookie',
          'x-api-key': 'fb_cli_secret-key',
          accept: 'application/json',
        },
      },
      res: { headers: { 'set-cookie': ['refresh_token=secret-cookie'] } },
    });
    expect(line).not.toContain('secret-key');
    expect(line).not.toContain('secret-cookie');
    expect(line).toContain('application/json');
    expect(line).toContain(REDACTED);
  });

  it.each(['password', 'refreshToken', 'accessToken', 'apiKey', 'secret'])(
    'hides a nested %s field',
    (field) => {
      expect(logLine({ user: { [field]: 'top-secret-value' } })).not.toContain('top-secret-value');
    },
  );
});
