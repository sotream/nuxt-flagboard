import type { INestApplicationContext } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Role } from '../../../common/enums/role.enum.js';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface.js';
import { hashPassword } from '../../../common/utils/password.js';
import { ApiKeysService } from '../../../modules/api-keys/api-keys.service.js';
import { FlagEnvironmentsService } from '../../../modules/flags/flag-environments.service.js';
import { FlagsService } from '../../../modules/flags/flags.service.js';
import { Project } from '../../../modules/projects/entities/project.entity.js';
import { ProjectsService } from '../../../modules/projects/projects.service.js';
import { User } from '../../../modules/users/entities/user.entity.js';
import { UsersService } from '../../../modules/users/users.service.js';
import type { SeedConfig } from './seed-config.js';

export const DEMO_PROJECT_KEY = 'demo';

export interface SeedResult {
  /** False when the demo project already existed: nothing was changed and no keys were created. */
  created: boolean;
  adminEmail: string;
  viewerEmail?: string;
  /** The full keys. Returned only when they were just created, because they cannot be read again. */
  serverKey?: string;
  clientKey?: string;
}

/**
 * Creates the admin (and optionally a viewer) and a demo project with flags in different states, through the same
 * services the API uses, so the data looks exactly like data made in the UI and the audit log shows who made it.
 * Safe to run again: if the demo project exists it does nothing.
 */
export async function runSeed(
  app: INestApplicationContext,
  config: SeedConfig,
): Promise<SeedResult> {
  const dataSource = app.get(DataSource);
  const admin = await ensureAdmin(dataSource, config);
  const viewerEmail = await ensureViewer(app, config);
  const base = { adminEmail: config.adminEmail, viewerEmail };

  if (await dataSource.getRepository(Project).findOne({ where: { key: DEMO_PROJECT_KEY } })) {
    return { created: false, ...base };
  }
  const actor: AuthenticatedUser = {
    id: admin.id,
    email: admin.email,
    role: Role.Admin,
    expiresAt: 0,
  };
  await createDemoProject(app, actor);
  const keys = app.get(ApiKeysService);
  const server = await keys.create(
    DEMO_PROJECT_KEY,
    { environment: 'dev', kind: 'server', name: 'Local development (server)' },
    actor,
  );
  const client = await keys.create(
    DEMO_PROJECT_KEY,
    { environment: 'dev', kind: 'client', name: 'Local development (client)' },
    actor,
  );
  return { created: true, ...base, serverKey: server.key, clientKey: client.key };
}

async function ensureAdmin(dataSource: DataSource, config: SeedConfig): Promise<User> {
  const users = dataSource.getRepository(User);
  const existing = await users.findOne({ where: { email: config.adminEmail } });
  if (existing) {
    return existing;
  }
  return users.save({
    email: config.adminEmail,
    passwordHash: await hashPassword(config.adminPassword),
    role: Role.Admin,
  });
}

async function ensureViewer(
  app: INestApplicationContext,
  config: SeedConfig,
): Promise<string | undefined> {
  if (!config.viewerPassword) {
    return undefined;
  }
  const users = app.get(UsersService);
  if (!(await users.findByEmail(config.viewerEmail))) {
    await users.createViewer(config.viewerEmail, config.viewerPassword);
  }
  return config.viewerEmail;
}

async function createDemoProject(
  app: INestApplicationContext,
  actor: AuthenticatedUser,
): Promise<void> {
  await app.get(ProjectsService).create(DEMO_PROJECT_KEY, 'Demo project', actor);
  const flags = app.get(FlagsService);
  const environments = app.get(FlagEnvironmentsService);
  const update = (
    flagKey: string,
    environment: string,
    change: Parameters<FlagEnvironmentsService['update']>[3],
  ) => environments.update(DEMO_PROJECT_KEY, flagKey, environment, change, actor);

  // A gradual rollout: a quarter of dev users, everyone in staging, off in prod.
  await flags.create(
    DEMO_PROJECT_KEY,
    {
      key: 'new-checkout',
      name: 'New checkout',
      description: 'Redesigned checkout, rolled out gradually.',
      type: 'boolean',
      clientVisible: true,
    },
    actor,
  );
  await update('new-checkout', 'dev', { revision: 1, enabled: true, rolloutPercentage: 25 });
  await update('new-checkout', 'staging', { revision: 1, enabled: true, rolloutPercentage: 100 });

  // A plain switch that is on.
  await flags.create(
    DEMO_PROJECT_KEY,
    {
      key: 'dark-mode',
      name: 'Dark mode',
      description: 'Offer the dark theme.',
      type: 'boolean',
      clientVisible: true,
    },
    actor,
  );
  await update('dark-mode', 'dev', { revision: 1, enabled: true, rolloutPercentage: 100 });

  // A string flag with a targeting rule: users in Ukraine and Poland get the new editor.
  await flags.create(
    DEMO_PROJECT_KEY,
    {
      key: 'editor',
      name: 'Editor version',
      description: 'Which editor to load.',
      type: 'string',
      onValue: 'new-editor',
      offValue: 'classic',
      clientVisible: true,
    },
    actor,
  );
  await update('editor', 'dev', {
    revision: 1,
    enabled: true,
    rules: [
      { conditions: [{ attribute: 'country', operator: 'in', values: ['UA', 'PL'] }], serve: 'on' },
    ],
  });

  // Server only (not client-visible), targeted by plan.
  await flags.create(
    DEMO_PROJECT_KEY,
    {
      key: 'premium-export',
      name: 'Premium export',
      description: 'Export to PDF for paying plans.',
      type: 'boolean',
    },
    actor,
  );
  await update('premium-export', 'dev', {
    revision: 1,
    enabled: true,
    rules: [
      { conditions: [{ attribute: 'plan', operator: 'in', values: ['pro', 'team'] }], serve: 'on' },
    ],
  });

  // A flag that is fully on but switched off by the kill switch.
  await flags.create(
    DEMO_PROJECT_KEY,
    {
      key: 'payments-v2',
      name: 'Payments v2',
      description: 'New payment provider.',
      type: 'boolean',
    },
    actor,
  );
  await update('payments-v2', 'dev', { revision: 1, enabled: true, rolloutPercentage: 100 });
  await environments.engageKillSwitch(
    DEMO_PROJECT_KEY,
    'payments-v2',
    'dev',
    { revision: 2, reason: 'Elevated payment errors (demo)' },
    actor,
  );
}
