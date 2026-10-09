import { Controller, Get, Post } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Public } from '../src/common/decorators/public.decorator.js';
import { Roles } from '../src/common/decorators/roles.decorator.js';
import { Role } from '../src/common/enums/role.enum.js';
import { createTestApp, createUser, WEB_ORIGIN } from './helpers/test-app.js';
import type { TestApp, TestUser } from './helpers/test-app.js';

// Test-only routes that exercise the global guards exactly as real routes are protected.
@Controller('probe')
class ProbeController {
  @Get('read')
  read(): string {
    return 'read';
  }

  @Post('write')
  write(): string {
    return 'write';
  }

  @Post('viewer-allowed')
  @Roles(Role.Viewer, Role.Admin)
  viewerAllowed(): string {
    return 'viewer-allowed';
  }

  @Get('public')
  @Public()
  open(): string {
    return 'public';
  }
}

let t: TestApp;
let admin: TestUser;
let viewer: TestUser;

beforeAll(async () => {
  t = await createTestApp({
    env: { LOGIN_RATE_LIMIT_PER_MINUTE: '1000' },
    controllers: [ProbeController],
  });
  admin = await createUser(t.dataSource, Role.Admin);
  viewer = await createUser(t.dataSource, Role.Viewer);
});

afterAll(async () => {
  await t.close();
});

async function tokenFor(user: TestUser): Promise<string> {
  const response = await t.http
    .post('/api/v1/auth/login')
    .set('Origin', WEB_ORIGIN)
    .send({ email: user.email, password: user.password })
    .expect(200);
  return response.body.accessToken;
}

describe('authentication', () => {
  it('lets anyone reach a public route', async () => {
    await t.http.get('/probe/public').expect(200);
  });

  it('rejects a request without a token', async () => {
    await t.http.get('/probe/read').expect(401);
  });

  it('rejects a malformed or tampered token', async () => {
    const token = await tokenFor(admin);
    await t.http.get('/probe/read').set('Authorization', 'Bearer nonsense').expect(401);
    await t.http.get('/probe/read').set('Authorization', `Bearer ${token}x`).expect(401);
    await t.http.get('/probe/read').set('Authorization', token).expect(401); // no Bearer scheme
  });

  it('rejects a token signed with another key', async () => {
    const forged = await new JwtService().signAsync(
      { sub: admin.id, email: admin.email, role: 'admin' },
      { secret: 'another-secret-that-is-long-enough-1234567890' },
    );
    await t.http.get('/probe/read').set('Authorization', `Bearer ${forged}`).expect(401);
  });

  it('rejects an unsigned token (alg none)', async () => {
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: admin.id, email: admin.email, role: 'admin' })}.`;
    await t.http.get('/probe/read').set('Authorization', `Bearer ${unsigned}`).expect(401);
  });

  it('rejects an expired token', async () => {
    const expired = await new JwtService({ secret: process.env.JWT_ACCESS_SECRET }).signAsync(
      { sub: admin.id, email: admin.email, role: 'admin' },
      { expiresIn: -10 },
    );
    await t.http.get('/probe/read').set('Authorization', `Bearer ${expired}`).expect(401);
  });
});

describe('roles', () => {
  it('lets a viewer read', async () => {
    await t.http
      .get('/probe/read')
      .set('Authorization', `Bearer ${await tokenFor(viewer)}`)
      .expect(200);
  });

  it('forbids a viewer from writing by default', async () => {
    await t.http
      .post('/probe/write')
      .set('Authorization', `Bearer ${await tokenFor(viewer)}`)
      .expect(403);
  });

  it('lets an admin write', async () => {
    await t.http
      .post('/probe/write')
      .set('Authorization', `Bearer ${await tokenFor(admin)}`)
      .expect(201);
  });

  it('honours an explicit @Roles() that opens a write route to viewers', async () => {
    await t.http
      .post('/probe/viewer-allowed')
      .set('Authorization', `Bearer ${await tokenFor(viewer)}`)
      .expect(201);
  });
});
