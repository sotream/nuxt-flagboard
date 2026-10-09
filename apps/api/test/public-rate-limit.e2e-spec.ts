import { generateApiKey } from '../src/modules/api-keys/api-key.js';
import { createApiKey } from './helpers/api-session.js';
import { seedEvaluationProject, startSession } from './helpers/flag-fixtures.js';
import type { ApiSession } from './helpers/api-session.js';

let s: ApiSession;
let projectKey: string;

beforeAll(async () => {
  s = await startSession({
    API_KEY_RATE_LIMIT_PER_MINUTE: '3',
    KEY_AUTH_FAILURE_LIMIT_PER_MINUTE: '3',
  });
  ({ projectKey } = await seedEvaluationProject(s));
});

afterAll(async () => {
  await s.t.close();
});

const call = (key: string) =>
  s.t.http
    .post('/v1/evaluate')
    .set({ Authorization: `Bearer ${key}` })
    .send({});

describe('per-key rate limit', () => {
  it('answers 429 with Retry-After once a key has used its minute, and leaves other keys alone', async () => {
    const busy = (await createApiKey(s, projectKey, 'server')).key;
    const other = (await createApiKey(s, projectKey, 'client')).key;

    for (let i = 0; i < 3; i++) await call(busy).expect(200);
    const limited = await call(busy).expect(429);

    expect(Number(limited.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    await call(other).expect(200);
  });
});

describe('failed authentication limit', () => {
  it('blocks further unknown keys from an IP after too many failures, without blocking keys already known to be valid', async () => {
    const known = (await createApiKey(s, projectKey, 'server')).key;
    const unseen = (await createApiKey(s, projectKey, 'server')).key;
    await call(known).expect(200); // now cached as valid

    for (let i = 0; i < 3; i++) await call(generateApiKey('server').plaintext).expect(401);
    const blocked = await call(generateApiKey('server').plaintext).expect(429);

    expect(Number(blocked.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    await call(known).expect(200); // a key the server already knows still works
    await call(unseen).expect(429); // a valid key it has not seen yet waits for the window: no database lookup
  });
});
