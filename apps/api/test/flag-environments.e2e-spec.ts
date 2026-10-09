import { FlagChangeBus } from '../src/modules/flags/flag-change.bus.js';
import type { FlagChange } from '../src/modules/flags/flag-change.bus.js';
import { unique } from './helpers/app-role.js';
import { startSession } from './helpers/api-session.js';
import type { ApiSession } from './helpers/api-session.js';

let s: ApiSession;
let projectKey: string;
let flagKey: string;
let events: FlagChange[];

beforeAll(async () => {
  s = await startSession();
  s.t.app.get(FlagChangeBus).changes$.subscribe((change) => events.push(change));
});

beforeEach(async () => {
  events = [];
  ({ key: projectKey } = await s.newProject());
  flagKey = `flag-${unique()}`;
  await s.t.http
    .post(`/api/v1/projects/${projectKey}/flags`)
    .set(s.as(s.adminToken))
    .send({ key: flagKey, name: 'Test flag', type: 'boolean' })
    .expect(201);
  events = []; // creating the flag published its own event
});

afterAll(async () => {
  await s.t.close();
});

const url = (environment = 'dev', suffix = '') =>
  `/api/v1/projects/${projectKey}/flags/${flagKey}/environments/${environment}${suffix}`;
const patch = (body: object, environment = 'dev', token = s.adminToken) =>
  s.t.http.patch(url(environment)).set(s.as(token)).send(body);
const post = (suffix: string, body: object, environment = 'dev', token = s.adminToken) =>
  s.t.http.post(url(environment, suffix)).set(s.as(token)).send(body);
const stateOf = async (environment = 'dev') =>
  (
    await s.t.http
      .get(`/api/v1/projects/${projectKey}/flags/${flagKey}`)
      .set(s.as(s.adminToken))
      .expect(200)
  ).body.environments.find((e: { environment: string }) => e.environment === environment);
const auditOf = async () =>
  (
    await s.t.http
      .get(`/api/v1/projects/${projectKey}/audit?flagKey=${flagKey}`)
      .set(s.as(s.adminToken))
      .expect(200)
  ).body.items as {
    action: string;
    environmentKey: string | null;
    before: Record<string, unknown> | null;
    after: Record<string, unknown>;
  }[];

const ukraineRule = {
  conditions: [{ attribute: 'country', operator: 'equals', value: 'UA' }],
  serve: 'on',
};

describe('PATCH .../environments/:env', () => {
  it('updates the state and returns the new revision', async () => {
    const response = await patch({
      revision: 1,
      enabled: true,
      rolloutPercentage: 25,
      rules: [
        ukraineRule,
        {
          conditions: [{ attribute: 'plan', operator: 'in', values: ['pro', 'team'] }],
          serve: 'off',
        },
      ],
    }).expect(200);

    expect(response.body).toMatchObject({
      environment: 'dev',
      enabled: true,
      rolloutPercentage: 25,
      revision: 2,
    });
    expect(response.body.rules).toEqual([
      ukraineRule,
      {
        conditions: [{ attribute: 'plan', operator: 'in', values: ['pro', 'team'] }],
        serve: 'off',
      },
    ]);
    expect(await stateOf()).toMatchObject({ enabled: true, rolloutPercentage: 25, revision: 2 });
  });

  it('bumps the revision by one on every change', async () => {
    await patch({ revision: 1, enabled: true }).expect(200);
    const second = await patch({ revision: 2, rolloutPercentage: 10 }).expect(200);
    expect(second.body.revision).toBe(3);
  });

  it('changes one environment without touching the others', async () => {
    await patch({ revision: 1, enabled: true, rolloutPercentage: 50 }, 'staging').expect(200);

    expect(await stateOf('staging')).toMatchObject({
      enabled: true,
      rolloutPercentage: 50,
      revision: 2,
    });
    expect(await stateOf('dev')).toMatchObject({
      enabled: false,
      rolloutPercentage: 0,
      revision: 1,
    });
    expect(await stateOf('prod')).toMatchObject({
      enabled: false,
      rolloutPercentage: 0,
      revision: 1,
    });
  });

  it('audits the environment and only the fields that changed, before and after', async () => {
    await patch({ revision: 1, enabled: true, rolloutPercentage: 0 }).expect(200);

    const event = (await auditOf()).find((e) => e.action === 'flag.environment.updated')!;
    expect(event.environmentKey).toBe('dev');
    expect(event.before).toEqual({ enabled: false });
    expect(event.after).toEqual({ enabled: true });
  });

  it('does nothing, and audits nothing, when the values already match', async () => {
    const response = await patch({
      revision: 1,
      enabled: false,
      rolloutPercentage: 0,
      rules: [],
    }).expect(200);

    expect(response.body.revision).toBe(1);
    expect((await auditOf()).map((e) => e.action)).toEqual(['flag.created']);
    expect(events).toEqual([]);
  });

  it('publishes a change event with the new revision after it committed', async () => {
    await patch({ revision: 1, enabled: true }).expect(200);

    expect(events).toEqual([
      expect.objectContaining({ flagKey, environmentKey: 'dev', revision: 2 }),
    ]);
  });

  it('stores only the fields that belong to the operator', async () => {
    const response = await patch({
      revision: 1,
      rules: [
        {
          conditions: [{ attribute: 'country', operator: 'equals', value: 'UA', values: ['x'] }],
          serve: 'on',
        },
      ],
    }).expect(200);

    expect(response.body.rules[0].conditions[0]).toEqual({
      attribute: 'country',
      operator: 'equals',
      value: 'UA',
    });
  });

  it('keeps rule order and supports numbers and booleans', async () => {
    const rules = [
      { conditions: [{ attribute: 'tier', operator: 'equals', value: 3 }], serve: 'on' },
      { conditions: [{ attribute: 'beta', operator: 'equals', value: true }], serve: 'off' },
    ];
    const response = await patch({ revision: 1, rules }).expect(200);
    expect(response.body.rules).toEqual(rules);
  });
});

describe('optimistic locking', () => {
  it('answers 409 with the current state when the revision is stale, and changes nothing', async () => {
    await patch({ revision: 1, enabled: true }).expect(200);

    const response = await patch({ revision: 1, rolloutPercentage: 80 }).expect(409);

    expect(response.body).toMatchObject({
      code: 'REVISION_MISMATCH',
      current: { enabled: true, revision: 2, rolloutPercentage: 0 },
    });
    expect(await stateOf()).toMatchObject({ rolloutPercentage: 0, revision: 2 });
    expect((await auditOf()).filter((e) => e.action === 'flag.environment.updated')).toHaveLength(
      1,
    );
  });

  it('lets only one of many concurrent updates with the same revision win', async () => {
    // Open the pool's connections first, otherwise the requests do not overlap (see the auth race test).
    await Promise.all(
      Array.from({ length: 8 }, () => s.t.dataSource.query('SELECT pg_sleep(0.1)')),
    );

    const responses = await Promise.all(
      Array.from({ length: 8 }, (_, i) => patch({ revision: 1, rolloutPercentage: i + 1 })),
    );

    expect(responses.filter((r) => r.status === 200)).toHaveLength(1);
    expect(responses.filter((r) => r.status === 409)).toHaveLength(7);
    expect((await stateOf()).revision).toBe(2);
  });

  it('does not publish an event for a rejected update', async () => {
    await patch({ revision: 1, enabled: true }).expect(200);
    events = [];
    await patch({ revision: 1, rolloutPercentage: 5 }).expect(409);
    expect(events).toEqual([]);
  });

  it('requires a positive integer revision', async () => {
    await patch({ enabled: true }).expect(400);
    await patch({ revision: 0, enabled: true }).expect(400);
    await patch({ revision: '1', enabled: true }).expect(400);
  });
});

describe('validation', () => {
  it.each([
    ['a negative rollout', { rolloutPercentage: -1 }],
    ['a rollout above 100', { rolloutPercentage: 101 }],
    ['a fractional rollout', { rolloutPercentage: 1.5 }],
    ['a rollout sent as a string', { rolloutPercentage: '50' }],
    ['a non-boolean enabled', { enabled: 'yes' }],
    ['more than 20 rules', { rules: Array.from({ length: 21 }, () => ukraineRule) }],
    ['a rule without conditions', { rules: [{ conditions: [], serve: 'on' }] }],
    [
      'a rule with more than 10 conditions',
      {
        rules: [
          { conditions: Array.from({ length: 11 }, () => ukraineRule.conditions[0]), serve: 'on' },
        ],
      },
    ],
    [
      'an unknown operator',
      { rules: [{ conditions: [{ attribute: 'a', operator: 'regex', value: 'x' }], serve: 'on' }] },
    ],
    [
      'equals without a value',
      { rules: [{ conditions: [{ attribute: 'a', operator: 'equals' }], serve: 'on' }] },
    ],
    [
      'an object as a value',
      {
        rules: [
          { conditions: [{ attribute: 'a', operator: 'equals', value: { x: 1 } }], serve: 'on' },
        ],
      },
    ],
    [
      'null as a value',
      {
        rules: [{ conditions: [{ attribute: 'a', operator: 'equals', value: null }], serve: 'on' }],
      },
    ],
    [
      'in with an empty list',
      { rules: [{ conditions: [{ attribute: 'a', operator: 'in', values: [] }], serve: 'on' }] },
    ],
    [
      'in with more than 50 values',
      {
        rules: [
          {
            conditions: [
              { attribute: 'a', operator: 'in', values: Array.from({ length: 51 }, (_, i) => i) },
            ],
            serve: 'on',
          },
        ],
      },
    ],
    [
      'in with a non-array',
      { rules: [{ conditions: [{ attribute: 'a', operator: 'in', values: 'x' }], serve: 'on' }] },
    ],
    [
      'a value over 256 characters',
      {
        rules: [
          {
            conditions: [{ attribute: 'a', operator: 'equals', value: 'v'.repeat(257) }],
            serve: 'on',
          },
        ],
      },
    ],
    [
      'an empty attribute name',
      { rules: [{ conditions: [{ attribute: '', operator: 'equals', value: 'x' }], serve: 'on' }] },
    ],
    [
      'an attribute name with a space',
      {
        rules: [
          { conditions: [{ attribute: 'a b', operator: 'equals', value: 'x' }], serve: 'on' },
        ],
      },
    ],
    [
      'an attribute name over 64 characters',
      {
        rules: [
          {
            conditions: [{ attribute: 'a'.repeat(65), operator: 'equals', value: 'x' }],
            serve: 'on',
          },
        ],
      },
    ],
    ['an unknown serve value', { rules: [{ conditions: ukraineRule.conditions, serve: 'maybe' }] }],
    ['an unknown field on a rule', { rules: [{ ...ukraineRule, priority: 1 }] }],
    ['an unknown top-level field', { killSwitch: true }],
  ])('rejects %s', async (_label, body) => {
    await patch({ revision: 1, ...body }).expect(400);
  });

  it('answers 404 for an unknown environment or flag', async () => {
    await patch({ revision: 1, enabled: true }, 'qa').expect(404);
    await s.t.http
      .patch(`/api/v1/projects/${projectKey}/flags/nope/environments/dev`)
      .set(s.as(s.adminToken))
      .send({ revision: 1, enabled: true })
      .expect(404);
  });

  it('answers 409 for an archived flag', async () => {
    await s.t.http
      .patch(`/api/v1/projects/${projectKey}/flags/${flagKey}`)
      .set(s.as(s.adminToken))
      .send({ archived: true })
      .expect(200);
    await patch({ revision: 1, enabled: true }).expect(409);
  });

  it('is forbidden for a viewer and unauthorised without a token', async () => {
    await patch({ revision: 1, enabled: true }, 'dev', s.viewerToken).expect(403);
    await s.t.http.patch(url()).send({ revision: 1, enabled: true }).expect(401);
  });
});

describe('kill switch', () => {
  it('turns the flag off in one environment with a reason, and audits it', async () => {
    const response = await post('/kill-switch', {
      revision: 1,
      reason: 'Checkout errors spiking',
    }).expect(200);

    expect(response.body).toMatchObject({
      killSwitch: true,
      killReason: 'Checkout errors spiking',
      revision: 2,
    });
    const event = (await auditOf()).find((e) => e.action === 'flag.kill_switch.enabled')!;
    expect(event.environmentKey).toBe('dev');
    expect(event.before).toEqual({ killSwitch: false, killReason: null });
    expect(event.after).toEqual({ killSwitch: true, killReason: 'Checkout errors spiking' });
    expect(await stateOf('prod')).toMatchObject({ killSwitch: false });
  });

  it('releases the switch, clears the reason and keeps the old reason in the audit log', async () => {
    await post('/kill-switch', { revision: 1, reason: 'Incident 42' }).expect(200);
    const released = await post('/kill-switch/release', { revision: 2 }).expect(200);

    expect(released.body).toMatchObject({ killSwitch: false, killReason: null, revision: 3 });
    const event = (await auditOf()).find((e) => e.action === 'flag.kill_switch.disabled')!;
    expect(event.before).toEqual({ killSwitch: true, killReason: 'Incident 42' });
  });

  it('requires a reason', async () => {
    await post('/kill-switch', { revision: 1 }).expect(400);
    await post('/kill-switch', { revision: 1, reason: '   ' }).expect(400);
    await post('/kill-switch', { revision: 1, reason: 'r'.repeat(501) }).expect(400);
  });

  it('answers 409 when the switch is already on or already off', async () => {
    await post('/kill-switch/release', { revision: 1 }).expect(409);
    await post('/kill-switch', { revision: 1, reason: 'First' }).expect(200);
    await post('/kill-switch', { revision: 2, reason: 'Again' }).expect(409);
  });

  it('answers 409 with the current state on a stale revision', async () => {
    await patch({ revision: 1, enabled: true }).expect(200);
    const response = await post('/kill-switch', { revision: 1, reason: 'Late' }).expect(409);
    expect(response.body).toMatchObject({
      code: 'REVISION_MISMATCH',
      current: { revision: 2, killSwitch: false },
    });
  });

  it('publishes a change event and is admin only', async () => {
    await post('/kill-switch', { revision: 1, reason: 'Go' }).expect(200);
    expect(events).toEqual([expect.objectContaining({ environmentKey: 'dev', revision: 2 })]);

    await post('/kill-switch', { revision: 2, reason: 'Go' }, 'dev', s.viewerToken).expect(403);
    await post('/kill-switch/release', { revision: 2 }, 'dev', s.viewerToken).expect(403);
  });
});
