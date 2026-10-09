import { DEMO_PROJECT_KEY, runSeed } from '../src/infrastructure/database/seeds/seed.js';
import type { SeedResult } from '../src/infrastructure/database/seeds/seed.js';
import { readSeedConfig } from '../src/infrastructure/database/seeds/seed-config.js';
import { createTestApp, WEB_ORIGIN } from './helpers/test-app.js';
import type { TestApp } from './helpers/test-app.js';

const config = readSeedConfig({
  APP_ENV: 'dev',
  SEED_ADMIN_PASSWORD: 'a-seed-admin-password',
  SEED_VIEWER_PASSWORD: 'a-seed-viewer-password',
});

let t: TestApp;
let seeded!: SeedResult; // the result of the first run, whose keys exist nowhere else

beforeAll(async () => {
  t = await createTestApp({ env: { LOGIN_RATE_LIMIT_PER_MINUTE: '1000' } });
  seeded = await runSeed(t.app, config);
});

afterAll(async () => {
  await t.close();
});

const login = (email: string, password: string) =>
  t.http.post('/api/v1/auth/login').set('Origin', WEB_ORIGIN).send({ email, password });
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const evaluateWith = (key: string) =>
  t.http
    .post('/v1/evaluate')
    .set(bearer(key))
    .send({ context: { userId: 'user-1' } });
const counts = () =>
  t.dataSource.query(
    'SELECT (SELECT count(*) FROM api_keys)::int AS keys, (SELECT count(*) FROM flags)::int AS flags, (SELECT count(*) FROM users)::int AS users',
  );

describe('seed', () => {
  it('creates the accounts, the demo project with flags in different states, and two keys', async () => {
    expect(seeded).toMatchObject({
      created: true,
      adminEmail: 'admin@example.com',
      viewerEmail: 'viewer@example.com',
    });
    expect(seeded.serverKey).toMatch(/^fb_srv_/);
    expect(seeded.clientKey).toMatch(/^fb_cli_/);

    const admin = await login('admin@example.com', 'a-seed-admin-password').expect(200);
    const viewer = await login('viewer@example.com', 'a-seed-viewer-password').expect(200);
    expect(admin.body.user.role).toBe('admin');
    expect(viewer.body.user.role).toBe('viewer');

    const flags = await t.http
      .get(`/api/v1/projects/${DEMO_PROJECT_KEY}/flags`)
      .set(bearer(admin.body.accessToken))
      .expect(200);
    const dev = (key: string) =>
      flags.body
        .find((f: { key: string }) => f.key === key)
        .environments.find((e: { environment: string }) => e.environment === 'dev');
    expect(flags.body.map((f: { key: string }) => f.key).sort()).toEqual([
      'dark-mode',
      'editor',
      'new-checkout',
      'payments-v2',
      'premium-export',
    ]);
    expect(dev('new-checkout')).toMatchObject({ enabled: true, rolloutPercentage: 25 });
    expect(dev('editor').rules).toHaveLength(1);
    expect(dev('payments-v2')).toMatchObject({
      killSwitch: true,
      killReason: 'Elevated payment errors (demo)',
    });
  });

  it('is safe to run again: changes nothing and creates no new keys', async () => {
    const before = await counts();

    const again = await runSeed(t.app, config);

    expect(again).toMatchObject({ created: false });
    expect(again.serverKey).toBeUndefined();
    expect(again.clientKey).toBeUndefined();
    expect(await counts()).toEqual(before);
    await login('admin@example.com', 'a-seed-admin-password').expect(200); // the password was not touched
  });

  it('records who created the demo data in the audit log', async () => {
    const admin = await login('admin@example.com', 'a-seed-admin-password').expect(200);
    const audit = await t.http
      .get(`/api/v1/projects/${DEMO_PROJECT_KEY}/audit?limit=100`)
      .set(bearer(admin.body.accessToken))
      .expect(200);

    const actions = new Set(audit.body.items.map((e: { action: string }) => e.action));
    expect(actions).toEqual(
      new Set([
        'project.created',
        'flag.created',
        'flag.environment.updated',
        'flag.kill_switch.enabled',
        'api_key.created',
      ]),
    );
    expect(
      audit.body.items.every((e: { actorEmail: string }) => e.actorEmail === 'admin@example.com'),
    ).toBe(true);
  });
});

describe('keys printed by the seed', () => {
  it('work: the server key sees every flag, the client key only the client-visible ones', async () => {
    const server = await evaluateWith(seeded.serverKey!).expect(200);
    const client = await evaluateWith(seeded.clientKey!).expect(200);

    expect(server.body.flags['payments-v2']).toEqual({ value: false, reason: 'KILL_SWITCH' });
    expect(server.body.flags['dark-mode']).toEqual({ value: true, reason: 'ROLLOUT_IN' });
    expect(Object.keys(server.body.flags)).toHaveLength(5);
    expect(Object.keys(client.body.flags).sort()).toEqual(['dark-mode', 'editor', 'new-checkout']);
  });

  it('give the server key the snapshot and the client key a 403', async () => {
    await t.http.get('/v1/snapshot').set(bearer(seeded.clientKey!)).expect(403);
    await t.http.get('/v1/snapshot').set(bearer(seeded.serverKey!)).expect(200);
  });
});
