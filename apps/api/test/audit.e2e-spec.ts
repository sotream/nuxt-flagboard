import { Role } from '../src/common/enums/role.enum.js';
import { AuditService } from '../src/modules/audit/audit.service.js';
import { unique } from './helpers/app-role.js';
import { createTestApp, createUser, WEB_ORIGIN } from './helpers/test-app.js';
import type { TestApp, TestUser } from './helpers/test-app.js';

let t: TestApp;
let audit: AuditService;
let admin: TestUser;
let adminToken: string;
let viewerToken: string;
let projectKey: string;
let projectId: string;
const actor = () => ({ id: admin.id, email: admin.email });

async function signIn(user: TestUser): Promise<string> {
  const response = await t.http
    .post('/api/v1/auth/login')
    .set('Origin', WEB_ORIGIN)
    .send({ email: user.email, password: user.password })
    .expect(200);
  return response.body.accessToken;
}

const as = (token: string) => ({ Authorization: `Bearer ${token}` });
const list = (query = '', key = projectKey, token = adminToken) =>
  t.http.get(`/api/v1/projects/${key}/audit${query}`).set(as(token));

async function newProject(): Promise<{ key: string; id: string }> {
  const key = `audit-${unique()}`;
  const response = await t.http
    .post('/api/v1/projects')
    .set(as(adminToken))
    .send({ key, name: 'Audit test' })
    .expect(201);
  return { key, id: response.body.id };
}

beforeAll(async () => {
  t = await createTestApp({ env: { LOGIN_RATE_LIMIT_PER_MINUTE: '1000' } });
  audit = t.app.get(AuditService);
  admin = await createUser(t.dataSource, Role.Admin);
  adminToken = await signIn(admin);
  viewerToken = await signIn(await createUser(t.dataSource, Role.Viewer));
});

beforeEach(async () => {
  ({ key: projectKey, id: projectId } = await newProject());
});

afterAll(async () => {
  await t.close();
});

describe('AuditService.record', () => {
  it('commits together with the change it belongs to', async () => {
    await t.dataSource.transaction((manager) =>
      audit.record(manager, {
        projectId,
        actor: actor(),
        action: 'flag.created',
        flagKey: 'new-checkout',
        after: { key: 'new-checkout' },
      }),
    );

    const response = await list('?flagKey=new-checkout').expect(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0]).toMatchObject({
      action: 'flag.created',
      actorEmail: admin.email,
      flagKey: 'new-checkout',
      before: null,
      after: { key: 'new-checkout' },
    });
  });

  it('is rolled back with the change when the transaction fails', async () => {
    await expect(
      t.dataSource.transaction(async (manager) => {
        await audit.record(manager, {
          projectId,
          actor: actor(),
          action: 'flag.created',
          flagKey: 'ghost',
        });
        throw new Error('the change itself failed');
      }),
    ).rejects.toThrow('the change itself failed');

    const response = await list('?flagKey=ghost').expect(200);
    expect(response.body.items).toEqual([]);
  });
});

describe('GET /api/v1/projects/:key/audit', () => {
  async function recordMany(count: number, flagKey: string): Promise<void> {
    // One transaction: every row gets the same created_at, so ordering depends on the id tie-break.
    await t.dataSource.transaction(async (manager) => {
      for (let i = 0; i < count; i++) {
        await audit.record(manager, {
          projectId,
          actor: actor(),
          action: 'flag.updated',
          flagKey,
          after: { n: i },
        });
      }
    });
  }

  it('returns newest first', async () => {
    await recordMany(1, 'first');
    await recordMany(1, 'second');

    const response = await list().expect(200);
    const flags = response.body.items.map((e: { flagKey: string | null }) => e.flagKey);
    expect(flags.slice(0, 2)).toEqual(['second', 'first']);
  });

  it('pages through rows with identical timestamps without skipping or repeating any', async () => {
    await recordMany(5, 'paged');

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 5; page++) {
      const query: string = `?flagKey=paged&limit=2${cursor ? `&cursor=${cursor}` : ''}`;
      const response = await list(query).expect(200);
      seen.push(...response.body.items.map((e: { id: string }) => e.id));
      cursor = response.body.nextCursor;
      if (!cursor) break;
    }

    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
  });

  it('returns a null cursor on the last page', async () => {
    await recordMany(2, 'short');
    const response = await list('?flagKey=short&limit=5').expect(200);
    expect(response.body.items).toHaveLength(2);
    expect(response.body.nextCursor).toBeNull();
  });

  it('filters by flag key', async () => {
    await recordMany(2, 'alpha');
    await recordMany(3, 'beta');

    const response = await list('?flagKey=beta&limit=100').expect(200);
    expect(response.body.items).toHaveLength(3);
  });

  it('only shows the events of the requested project', async () => {
    await recordMany(2, 'mine');
    const other = await newProject();

    const response = await list('?limit=100', other.key).expect(200);
    expect(response.body.items.every((e: { flagKey: string | null }) => e.flagKey !== 'mine')).toBe(
      true,
    );
  });

  it('rejects a cursor from another project or a malformed one', async () => {
    await recordMany(1, 'x');
    const mine = await list('').expect(200);
    const other = await newProject();

    await list(`?cursor=${mine.body.items[0].id}`, other.key).expect(400);
    await list('?cursor=not-a-uuid').expect(400);
  });

  it.each(['?limit=0', '?limit=101', '?limit=abc', `?flagKey=${'a'.repeat(65)}`])(
    'rejects the invalid query %s',
    async (query) => {
      await list(query).expect(400);
    },
  );

  it('is readable by a viewer, hidden without a token and 404 for an unknown project', async () => {
    await list('', projectKey, viewerToken).expect(200);
    await t.http.get(`/api/v1/projects/${projectKey}/audit`).expect(401);
    await list('', 'no-such-project').expect(404);
  });

  it('offers no way to change or delete events through the API', async () => {
    // 405, not 404, since the path exists for reading: the answer lists what is allowed, and writing is not in it.
    for (const method of ['delete', 'patch', 'put', 'post'] as const) {
      const response = await t.http[method](`/api/v1/projects/${projectKey}/audit`)
        .set(as(adminToken))
        .expect(405);
      expect(response.headers.allow).toBe('GET, HEAD');
    }
  });
});
