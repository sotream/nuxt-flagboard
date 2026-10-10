import { Controller, Get } from '@nestjs/common';
import { Public } from '../src/common/decorators/public.decorator.js';
import { unique } from './helpers/app-role.js';
import { startSession } from './helpers/api-session.js';
import type { ApiSession } from './helpers/api-session.js';
import { createTestApp, WEB_ORIGIN } from './helpers/test-app.js';
import type { TestApp } from './helpers/test-app.js';

@Controller('boom')
class BoomController {
  @Public()
  @Get()
  boom(): never {
    throw new Error('connect ECONNREFUSED 10.0.0.5:5432 password=hunter2');
  }
}

const PROBLEM = 'application/problem+json';
let s: ApiSession;
let projectKey: string;
let flagKey: string;

beforeAll(async () => {
  s = await startSession({ LOGIN_RATE_LIMIT_PER_MINUTE: '3' });
  ({ key: projectKey } = await s.newProject());
  flagKey = `flag-${unique()}`;
  await s.t.http
    .post(`/api/v1/projects/${projectKey}/flags`)
    .set(s.as(s.adminToken))
    .send({ key: flagKey, name: 'Flag', type: 'boolean' })
    .expect(201);
});

afterAll(async () => {
  await s.t.close();
});

describe('errors are RFC 9457 problem details', () => {
  it('answers an unknown route with application/problem+json and the request path as the instance', async () => {
    const response = await s.t.http.get('/api/v1/nothing-here').set(s.as(s.adminToken)).expect(404);
    expect(response.headers['content-type']).toContain(PROBLEM);
    expect(response.body).toMatchObject({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      instance: '/api/v1/nothing-here',
    });
  });

  it('has the standard members and none of the old Nest ones', async () => {
    const response = await s.t.http
      .get(`/api/v1/projects/nope-${unique()}`)
      .set(s.as(s.adminToken))
      .expect(404);
    expect(Object.keys(response.body).sort()).toEqual([
      'detail',
      'instance',
      'status',
      'title',
      'type',
    ]);
  });

  it('keeps the query string out of the instance', async () => {
    const response = await s.t.http
      .get('/api/v1/nothing-here?token=secret')
      .set(s.as(s.adminToken))
      .expect(404);
    expect(response.body.instance).toBe('/api/v1/nothing-here');
  });

  it('lists every invalid field of a request, with a JSON Pointer each', async () => {
    const response = await s.t.http
      .post('/api/v1/auth/login')
      .set('Origin', WEB_ORIGIN)
      .send({ email: 'not-an-email', password: '' })
      .expect(400);
    expect(response.headers['content-type']).toContain(PROBLEM);
    expect(response.body).toMatchObject({
      type: 'urn:flagboard:problem:validation-failed',
      title: 'Validation failed',
      status: 400,
      code: 'VALIDATION_FAILED',
    });
    const pointers = response.body.errors.map((e: { pointer: string }) => e.pointer);
    expect(pointers).toContain('#/email');
    expect(pointers).toContain('#/password');
    expect(response.body.errors[0]).toEqual({
      pointer: expect.stringMatching(/^#\//),
      detail: expect.any(String),
    });
  });

  it('points into nested request bodies', async () => {
    const response = await s.t.http
      .patch(`/api/v1/projects/${projectKey}/flags/${flagKey}/environments/dev`)
      .set(s.as(s.adminToken))
      .send({
        revision: 1,
        rules: [
          {
            conditions: [{ attribute: 'country', operator: 'equals', value: 'UA' }],
            serve: 'maybe',
          },
        ],
      })
      .expect(400);
    const pointers = response.body.errors.map((e: { pointer: string }) => e.pointer);
    expect(pointers).toContain('#/rules/0/serve');
  });

  it('answers a revision conflict with its own type, the code, and the current state as extensions', async () => {
    const response = await s.t.http
      .patch(`/api/v1/projects/${projectKey}/flags/${flagKey}/environments/dev`)
      .set(s.as(s.adminToken))
      .send({ revision: 99, rolloutPercentage: 10 })
      .expect(409);
    expect(response.headers['content-type']).toContain(PROBLEM);
    expect(response.body).toMatchObject({
      type: 'urn:flagboard:problem:revision-mismatch',
      title: 'Revision mismatch',
      status: 409,
      code: 'REVISION_MISMATCH',
      current: { environment: 'dev', revision: 1 },
    });
  });

  it('answers 429 with Retry-After and a rate-limited problem', async () => {
    const attempt = () =>
      s.t.http
        .post('/api/v1/auth/login')
        .set('Origin', WEB_ORIGIN)
        .send({ email: 'a@example.com', password: 'x' });
    let last = await attempt();
    for (let i = 0; i < 4 && last.status !== 429; i++) last = await attempt();
    expect(last.status).toBe(429);
    expect(last.headers['retry-after']).toMatch(/^\d+$/);
    expect(last.headers['content-type']).toContain(PROBLEM);
    expect(last.body).toMatchObject({
      type: 'urn:flagboard:problem:rate-limited',
      status: 429,
      code: 'RATE_LIMITED',
    });
  });
});

describe('a server error', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp({ controllers: [BoomController] });
  });
  afterAll(async () => {
    await t.close();
  });

  it('is a 500 problem that says nothing about the cause', async () => {
    const response = await t.http.get('/boom').expect(500);
    expect(response.headers['content-type']).toContain(PROBLEM);
    expect(response.body).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      instance: '/boom',
    });
    expect(response.text).not.toContain('hunter2');
  });
});
