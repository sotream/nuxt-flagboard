import { startSession } from './api-session.js';
import type { ApiSession } from './api-session.js';

type Body = Record<string, unknown>;

/** Creates a flag and its dev state through the admin API. */
export async function createFlag(
  s: ApiSession,
  projectKey: string,
  flag: Body,
  dev: Body = {},
): Promise<void> {
  await s.t.http
    .post(`/api/v1/projects/${projectKey}/flags`)
    .set(s.as(s.adminToken))
    .send(flag)
    .expect(201);
  if (Object.keys(dev).length > 0) {
    await s.t.http
      .patch(`/api/v1/projects/${projectKey}/flags/${String(flag.key)}/environments/dev`)
      .set(s.as(s.adminToken))
      .send({ revision: 1, ...dev })
      .expect(200);
  }
}

export const ukraineRule = {
  conditions: [{ attribute: 'country', operator: 'equals', value: 'UA' }],
  serve: 'on',
};

/** A project whose dev environment holds flags in every state the public API has to handle. */
export async function seedEvaluationProject(s: ApiSession): Promise<{ projectKey: string }> {
  const { key: projectKey } = await s.newProject();
  const on = { enabled: true, rolloutPercentage: 100 };
  await createFlag(
    s,
    projectKey,
    {
      key: 'checkout',
      name: 'Checkout',
      type: 'string',
      onValue: 'new',
      offValue: 'old',
      clientVisible: true,
    },
    on,
  );
  await createFlag(
    s,
    projectKey,
    { key: 'secret-flag', name: 'Server only', type: 'boolean', clientVisible: false },
    on,
  );
  await createFlag(
    s,
    projectKey,
    { key: 'by-country', name: 'By country', type: 'boolean', clientVisible: true },
    { enabled: true, rules: [ukraineRule] },
  );
  await createFlag(
    s,
    projectKey,
    { key: 'partial', name: 'Half rollout', type: 'boolean', clientVisible: true },
    { enabled: true, rolloutPercentage: 50 },
  );
  await createFlag(s, projectKey, {
    key: 'disabled',
    name: 'Disabled',
    type: 'boolean',
    clientVisible: true,
  });
  await createFlag(
    s,
    projectKey,
    { key: 'killed', name: 'Killed', type: 'boolean', clientVisible: true },
    on,
  );
  await s.t.http
    .post(`/api/v1/projects/${projectKey}/flags/killed/environments/dev/kill-switch`)
    .set(s.as(s.adminToken))
    .send({ revision: 2, reason: 'Incident' })
    .expect(200);
  await createFlag(
    s,
    projectKey,
    { key: 'archived-flag', name: 'Archived', type: 'boolean', clientVisible: true },
    on,
  );
  await s.t.http
    .patch(`/api/v1/projects/${projectKey}/flags/archived-flag`)
    .set(s.as(s.adminToken))
    .send({ archived: true })
    .expect(200);
  return { projectKey };
}

export { startSession };
