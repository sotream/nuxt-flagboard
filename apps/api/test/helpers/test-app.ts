import { Test } from '@nestjs/testing';
import type { INestApplication, Type } from '@nestjs/common';
import { hash as bcryptHash } from 'bcryptjs';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import type { Role } from '../../src/common/enums/role.enum.js';
import { User } from '../../src/modules/users/entities/user.entity.js';
import { configureApp } from '../../src/setup-app.js';
import { unique } from './app-role.js';

export const WEB_ORIGIN = 'http://localhost:3000';

export interface TestApp {
  app: INestApplication;
  http: ReturnType<typeof request>;
  dataSource: DataSource;
  close: () => Promise<void>;
}

/**
 * Boots the real application (all modules, guards and pipes) against the e2e database. `env` overrides are
 * applied before the app reads its configuration and undone on `close`. `controllers` adds test-only routes.
 */
export async function createTestApp(
  options: { env?: Record<string, string>; controllers?: Type[] } = {},
): Promise<TestApp> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries({ WEB_ORIGIN, ...options.env })) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers: options.controllers ?? [],
  }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  // Listen once so supertest reuses the server instead of opening and closing one per request.
  await app.listen(0);
  return {
    app,
    http: request(app.getHttpServer()),
    dataSource: app.get(DataSource),
    close: async () => {
      await app.close();
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    },
  };
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
  role: Role;
}

/** Inserts a user directly (the users endpoint comes later). The password is only ever a test value. */
export async function createUser(
  dataSource: DataSource,
  role: Role,
  password = 'a-long-test-password-1',
): Promise<TestUser> {
  const email = `${role}-${unique()}@example.com`;
  const saved = await dataSource
    .getRepository(User)
    .save({ email, passwordHash: await bcryptHash(password, 4), role });
  return { id: saved.id, email, password, role };
}

/** The `name=value` part of the refresh cookie from a response, or undefined when it was not set. */
export function refreshCookieOf(response: request.Response): string | undefined {
  const cookies = response.headers['set-cookie'] as unknown as string[] | undefined;
  return cookies?.find((cookie) => cookie.startsWith('flagboard_refresh='))?.split(';')[0];
}
