import { Role } from '../../src/common/enums/role.enum.js';
import { unique } from './app-role.js';
import { createTestApp, createUser, WEB_ORIGIN } from './test-app.js';
import type { TestApp, TestUser } from './test-app.js';

/** An app with a signed-in admin and a signed-in viewer, plus shortcuts for the calls tests repeat. */
export interface ApiSession {
  t: TestApp;
  admin: TestUser;
  adminToken: string;
  viewerToken: string;
  as: (token: string) => { Authorization: string };
  /** Creates a project and returns its key. */
  newProject: () => Promise<{ key: string; id: string }>;
}

export async function startSession(env: Record<string, string> = {}): Promise<ApiSession> {
  const t = await createTestApp({ env: { LOGIN_RATE_LIMIT_PER_MINUTE: '1000', ...env } });
  const signIn = async (user: TestUser): Promise<string> => {
    const response = await t.http
      .post('/api/v1/auth/login')
      .set('Origin', WEB_ORIGIN)
      .send({ email: user.email, password: user.password })
      .expect(200);
    return response.body.accessToken;
  };
  const admin = await createUser(t.dataSource, Role.Admin);
  const adminToken = await signIn(admin);
  const viewerToken = await signIn(await createUser(t.dataSource, Role.Viewer));
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  return {
    t,
    admin,
    adminToken,
    viewerToken,
    as,
    newProject: async () => {
      const key = `proj-${unique()}`;
      const response = await t.http
        .post('/api/v1/projects')
        .set(as(adminToken))
        .send({ key, name: 'Test project' })
        .expect(201);
      return { key, id: response.body.id };
    },
  };
}

/** Creates an API key through the admin API and returns its plaintext (the only time it is available). */
export async function createApiKey(
  session: ApiSession,
  projectKey: string,
  kind: 'server' | 'client',
  environment = 'dev',
): Promise<{ key: string; id: string }> {
  const response = await session.t.http
    .post(`/api/v1/projects/${projectKey}/keys`)
    .set(session.as(session.adminToken))
    .send({ environment, kind, name: `${kind} key` })
    .expect(201);
  return { key: response.body.key, id: response.body.id };
}
