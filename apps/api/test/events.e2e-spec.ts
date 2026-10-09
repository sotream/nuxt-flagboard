import { JwtService } from '@nestjs/jwt';
import { Role } from '../src/common/enums/role.enum.js';
import { StreamRegistry } from '../src/modules/events/stream-registry.service.js';
import { startSession } from './helpers/api-session.js';
import { openStream } from './helpers/sse-client.js';
import type { SseConnection } from './helpers/sse-client.js';
import { createApiKey } from './helpers/api-session.js';
import { createUser, WEB_ORIGIN } from './helpers/test-app.js';
import type { ApiSession } from './helpers/api-session.js';

let s: ApiSession;
let projectKey: string;
const open: SseConnection[] = [];

beforeAll(async () => {
  s = await startSession({ SSE_MAX_STREAMS_PER_USER: '2', SSE_HEARTBEAT_SECONDS: '1' });
});

beforeEach(async () => {
  ({ key: projectKey } = await s.newProject());
});

afterEach(() => {
  open.splice(0).forEach((connection) => connection.close());
});

afterAll(async () => {
  await s.t.close();
});

const eventsPath = (key = projectKey) => `/api/v1/projects/${key}/events`;
const connect = async (token = s.adminToken, key = projectKey): Promise<SseConnection> => {
  const connection = await openStream(s.t.app, eventsPath(key), token);
  open.push(connection);
  return connection;
};
const createFlag = (key: string, project = projectKey) =>
  s.t.http
    .post(`/api/v1/projects/${project}/flags`)
    .set(s.as(s.adminToken))
    .send({ key, name: key, type: 'boolean' })
    .expect(201);
const isChange = (flagKey: string) => (event: { type: string; data: unknown }) =>
  event.type === 'flag.changed' && (event.data as { flagKey: string }).flagKey === flagKey;
const quiet = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

describe('GET /api/v1/projects/:key/events', () => {
  it('opens an event stream and says it is ready', async () => {
    const stream = await connect();

    expect(stream.status).toBe(200);
    expect(stream.headers.get('content-type')).toContain('text/event-stream');
    expect(stream.headers.get('x-accel-buffering')).toBe('no');
    await stream.waitFor((event) => event.type === 'ready');
  });

  it('delivers a change with the flag, the environment and the new revision', async () => {
    const stream = await connect();
    await stream.waitFor((event) => event.type === 'ready');
    await createFlag('live');

    await s.t.http
      .patch(`/api/v1/projects/${projectKey}/flags/live/environments/staging`)
      .set(s.as(s.adminToken))
      .send({ revision: 1, enabled: true })
      .expect(200);

    const event = await stream.waitFor(
      (e) =>
        isChange('live')(e) &&
        (e.data as { environmentKey: string | null }).environmentKey === 'staging',
    );
    expect(event.data).toEqual({
      projectKey,
      flagKey: 'live',
      environmentKey: 'staging',
      revision: 2,
    });
  });

  it('delivers a change that touches every environment, such as a new flag', async () => {
    const stream = await connect();
    await createFlag('brand-new');

    const event = await stream.waitFor(isChange('brand-new'));
    expect(event.data).toMatchObject({ environmentKey: null, revision: null });
  });

  it('only delivers events of its own project', async () => {
    const other = await s.newProject();
    const mine = await connect();
    const theirs = await connect(s.adminToken, other.key);
    await mine.waitFor((e) => e.type === 'ready');
    await theirs.waitFor((e) => e.type === 'ready');

    await createFlag('in-other', other.key);
    await createFlag('in-mine');

    await theirs.waitFor(isChange('in-other'));
    await mine.waitFor(isChange('in-mine'));
    await quiet();
    expect(mine.events.some(isChange('in-other'))).toBe(false);
    expect(theirs.events.some(isChange('in-mine'))).toBe(false);
  });

  it('does not deliver anything for a change that was rejected', async () => {
    await createFlag('conflict');
    const stream = await connect();
    await stream.waitFor((e) => e.type === 'ready');
    const patch = (revision: number, body: object) =>
      s.t.http
        .patch(`/api/v1/projects/${projectKey}/flags/conflict/environments/dev`)
        .set(s.as(s.adminToken))
        .send({ revision, ...body });

    await patch(1, { enabled: true }).expect(200);
    await stream.waitFor(isChange('conflict'));
    await patch(1, { rolloutPercentage: 5 }).expect(409);
    await quiet();

    expect(stream.events.filter(isChange('conflict'))).toHaveLength(1);
  });

  it('sends heartbeats while idle', async () => {
    const stream = await connect();
    await stream.waitFor((e) => e.type === 'heartbeat', 2500);
  });

  it('is open to viewers', async () => {
    const stream = await connect(s.viewerToken);
    expect(stream.status).toBe(200);
  });

  it('answers 401 without or with a bad token, and for an API key', async () => {
    expect((await openStream(s.t.app, eventsPath())).status).toBe(401);
    expect((await openStream(s.t.app, eventsPath(), 'garbage')).status).toBe(401);
    const { key } = await createApiKey(s, projectKey, 'server');
    expect((await openStream(s.t.app, eventsPath(), key)).status).toBe(401);
  });

  it('answers 404 for an unknown project', async () => {
    expect((await openStream(s.t.app, eventsPath('no-such-project'), s.adminToken)).status).toBe(
      404,
    );
  });
});

describe('stream limit per user', () => {
  it('closes the oldest stream when a user opens one more than the limit', async () => {
    const first = await connect();
    const second = await connect();
    await first.waitFor((e) => e.type === 'ready');
    await second.waitFor((e) => e.type === 'ready');

    const third = await connect();

    expect(await first.endedWithin(2000)).toBe(true);
    expect(await second.endedWithin(300)).toBe(false);
    expect(await third.endedWithin(300)).toBe(false);
    await third.waitFor((e) => e.type === 'ready');
  });

  it('tells the evicted stream why it ends, so its client does not reconnect', async () => {
    const first = await connect();
    await connect();
    await first.waitFor((e) => e.type === 'ready');

    await connect();

    await first.waitFor((e) => e.type === 'evicted');
    expect(await first.endedWithin(2000)).toBe(true);
  });

  it('does not send evicted when a stream ends for another reason', async () => {
    const shortLived = await new JwtService({ secret: process.env.JWT_ACCESS_SECRET }).signAsync(
      { sub: s.admin.id, email: s.admin.email, role: Role.Admin },
      { expiresIn: 1 },
    );
    const stream = await connect(shortLived);
    await stream.waitFor((e) => e.type === 'ready');
    await stream.endedWithin(3000);

    expect(stream.events.some((e) => e.type === 'evicted')).toBe(false);
  });

  it('counts each user separately', async () => {
    const viewer = await connect(s.viewerToken);
    await connect();
    await connect();
    await connect();

    expect(await viewer.endedWithin(500)).toBe(false);
  });

  it('frees a slot when a stream is closed, so a reconnect never evicts a live stream', async () => {
    const first = await connect();
    const second = await connect();
    await second.waitFor((e) => e.type === 'ready');
    first.close();
    await first.endedWithin(1000);
    await quiet(200);
    expect(s.t.app.get(StreamRegistry).count(s.admin.id)).toBe(1); // the closed stream gave its slot back

    const third = await connect();
    await third.waitFor((e) => e.type === 'ready');

    expect(await second.endedWithin(500)).toBe(false);
    expect(s.t.app.get(StreamRegistry).count(s.admin.id)).toBe(2);
  });
});

describe('token expiry', () => {
  it('ends the stream when the access token expires, so the client reconnects with a fresh one', async () => {
    const shortLived = await new JwtService({ secret: process.env.JWT_ACCESS_SECRET }).signAsync(
      { sub: s.admin.id, email: s.admin.email, role: Role.Admin },
      { expiresIn: 2 },
    );
    const stream = await connect(shortLived);
    await stream.waitFor((e) => e.type === 'ready');

    expect(await stream.endedWithin(4000)).toBe(true);
  });
});

describe('shutdown', () => {
  it('ends every open stream when the registry is closed', async () => {
    const viewer = await createUser(s.t.dataSource, Role.Viewer);
    const login = await s.t.http
      .post('/api/v1/auth/login')
      .set('Origin', WEB_ORIGIN)
      .send({ email: viewer.email, password: viewer.password })
      .expect(200);
    const a = await connect();
    const b = await connect(login.body.accessToken, `${projectKey}`);
    await a.waitFor((e) => e.type === 'ready');
    await b.waitFor((e) => e.type === 'ready');

    s.t.app.get(StreamRegistry).closeAll();

    expect(await a.endedWithin(2000)).toBe(true);
    expect(await b.endedWithin(2000)).toBe(true);
  });
});
