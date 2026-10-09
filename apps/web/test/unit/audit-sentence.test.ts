import { describe, expect, it } from 'vitest';
import type { AuditEventView } from '../../app/utils/api-types';
import { describeEvent, groupByDay } from '../../app/utils/audit-sentence';

const event = (overrides: Partial<AuditEventView> = {}): AuditEventView => ({
  id: '1',
  action: 'flag.environment.updated',
  actorId: 'u',
  actorEmail: 'admin@example.com',
  flagKey: 'new-checkout',
  environmentKey: 'dev',
  before: null,
  after: null,
  createdAt: '2026-10-09T10:00:00.000Z',
  ...overrides,
});

describe('describeEvent', () => {
  it.each([
    ['project.created', null, { name: 'Demo' }, 'projects', ['Created the project “Demo”']],
    [
      'flag.created',
      null,
      { key: 'new-checkout', name: 'New checkout' },
      'flag',
      ['Created the flag “New checkout”'],
    ],
    ['flag.archived', { archived: false }, { archived: true }, 'flag', ['Archived the flag']],
    [
      'flag.kill_switch.disabled',
      { killSwitch: true },
      { killSwitch: false, killReason: null },
      'kill',
      ['Released the kill switch in dev'],
    ],
  ] as const)('says what %s did', (action, before, after, icon, sentences) => {
    const described = describeEvent(
      event({ action, before: before as never, after: after as never }),
    );
    expect(described).toEqual({ icon, sentences: [...sentences] });
  });

  it('says restored when the flag comes back', () => {
    const d = describeEvent(
      event({ action: 'flag.archived', before: { archived: true }, after: { archived: false } }),
    );
    expect(d.sentences).toEqual(['Restored the flag']);
  });

  it('names the kill switch reason', () => {
    const d = describeEvent(
      event({
        action: 'flag.kill_switch.enabled',
        environmentKey: 'prod',
        after: { killSwitch: true, killReason: 'provider errors' },
      }),
    );
    expect(d).toEqual({
      icon: 'kill',
      sentences: ['Switched the kill switch on in prod. Reason: provider errors'],
    });
  });

  it.each([
    [{ enabled: false }, { enabled: true }, 'Turned the flag on in dev'],
    [{ enabled: true }, { enabled: false }, 'Turned the flag off in dev'],
    [{ rolloutPercentage: 25 }, { rolloutPercentage: 60 }, 'Raised rollout from 25% to 60% in dev'],
    [{ rolloutPercentage: 60 }, { rolloutPercentage: 5 }, 'Lowered rollout from 60% to 5% in dev'],
    [{ rules: [] }, { rules: [{}, {}] }, 'Changed targeting rules in dev (0 rules to 2 rules)'],
    [{ rules: [{}] }, { rules: [] }, 'Changed targeting rules in dev (1 rule to 0 rules)'],
  ] as const)('describes an environment change %j to %j', (before, after, sentence) => {
    const d = describeEvent(event({ before: before as never, after: after as never }));
    expect(d.sentences).toEqual([sentence]);
  });

  it('gives several sentences for several changed fields, always in the order enabled, rollout, rules', () => {
    const d = describeEvent(
      event({
        // The key order in the stored JSON is deliberately the reverse of the sentence order.
        before: { rules: [], rolloutPercentage: 0, enabled: false },
        after: { rules: [{}], rolloutPercentage: 25, enabled: true },
      }),
    );
    expect(d.sentences).toEqual([
      'Turned the flag on in dev',
      'Raised rollout from 0% to 25% in dev',
      'Changed targeting rules in dev (0 rules to 1 rule)',
    ]);
  });

  it('orders flag edits as name, description, visibility', () => {
    const d = describeEvent(
      event({
        action: 'flag.updated',
        environmentKey: null,
        before: { clientVisible: false, description: 'a', name: 'Old' },
        after: { clientVisible: true, description: 'b', name: 'New' },
      }),
    );
    expect(d.sentences).toEqual([
      'Renamed the flag from “Old” to “New”',
      'Changed the description',
      'Made the flag visible to client keys',
    ]);
  });

  it.each([
    [
      'api_key.created',
      null,
      { id: 'k-123', name: 'Local development', kind: 'client', prefix: 'fb_cli_ab' },
      'Created the client key “Local development” in dev',
    ],
    [
      'api_key.revoked',
      { id: 'k-123', name: 'CI smoke', kind: 'server', prefix: 'fb_srv_ab' },
      null,
      'Revoked the server key “CI smoke” in dev',
    ],
  ] as const)('describes %s without showing ids', (action, before, after, sentence) => {
    const d = describeEvent(
      event({ action, before: before as never, after: after as never, flagKey: null }),
    );
    expect(d).toEqual({ icon: 'key', sentences: [sentence] });
    expect(d.sentences.join(' ')).not.toContain('k-123');
  });

  it('keeps markup as plain text: the helper never builds HTML', () => {
    const name = '<img src=x onerror=alert(1)>';
    const d = describeEvent(event({ action: 'flag.created', after: { name } }));
    expect(d.sentences).toEqual([`Created the flag “${name}”`]);
  });

  it('shortens a very long word without spaces to 80 characters', () => {
    const word = 'x'.repeat(300);
    const [sentence] = describeEvent(
      event({ action: 'flag.created', after: { name: word } }),
    ).sentences;
    expect(sentence).toBe(`Created the flag “${'x'.repeat(79)}…”`);
  });

  it.each([
    ['null before and after', { before: null, after: null }],
    ['rules that are not a list', { before: { rules: 'x' }, after: { rules: 7 } }],
    [
      'a rollout that is not a number',
      { before: { rolloutPercentage: 'a' }, after: { rolloutPercentage: null } },
    ],
    [
      'no environment',
      { environmentKey: null, before: { enabled: false }, after: { enabled: true } },
    ],
  ] as const)('never throws on %s and still says something', (_label, overrides) => {
    const d = describeEvent(event(overrides as never));
    expect(d.sentences.length).toBeGreaterThan(0);
    expect(d.sentences.every((s) => s.length > 0)).toBe(true);
  });

  it('falls back to the plain label for an action it does not know', () => {
    expect(describeEvent(event({ action: 'flag.teleported' }))).toEqual({
      icon: 'audit',
      sentences: ['flag.teleported'],
    });
  });
});

describe('groupByDay', () => {
  const at = (iso: string) => event({ id: iso, createdAt: iso });
  const labels = (groups: ReturnType<typeof groupByDay>) => groups.map((g) => g.label);

  it('labels today, yesterday and older days in UTC, keeping the order it was given', () => {
    const now = new Date('2026-10-09T10:00:00Z');
    const groups = groupByDay(
      [
        at('2026-10-09T09:00:00Z'),
        at('2026-10-09T00:00:00Z'),
        at('2026-10-08T23:59:59Z'),
        at('2026-10-07T12:00:00Z'),
        at('2025-12-31T23:30:00Z'),
      ],
      now,
      'UTC',
    );
    expect(labels(groups)).toEqual([
      'Today',
      'Yesterday',
      'Wednesday 7 October',
      'Wednesday 31 December 2025',
    ]);
    expect(groups[0]?.events.map((e) => e.id)).toEqual([
      '2026-10-09T09:00:00Z',
      '2026-10-09T00:00:00Z',
    ]);
  });

  it('puts an event exactly at local midnight into the new day (Europe/Berlin)', () => {
    const now = new Date('2026-10-08T22:30:00Z'); // 00:30 on 9 October in Berlin
    const groups = groupByDay(
      [at('2026-10-08T22:00:00Z'), at('2026-10-08T21:59:59Z')],
      now,
      'Europe/Berlin',
    );
    expect(labels(groups)).toEqual(['Today', 'Yesterday']);
  });

  it('treats the 25-hour day when summer time ends as one day (Europe/Berlin, 25 October 2026)', () => {
    const now = new Date('2026-10-26T12:00:00Z');
    // 23:59 CET, 02:00 CEST and 00:30 CEST: all on 25 October in Berlin.
    const groups = groupByDay(
      [at('2026-10-25T22:59:00Z'), at('2026-10-25T00:00:00Z'), at('2026-10-24T22:30:00Z')],
      now,
      'Europe/Berlin',
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe('Yesterday');
    expect(groups[0]?.events).toHaveLength(3);
  });

  it('finds yesterday on the calendar after the 23-hour day when summer time starts (Europe/Berlin, 29 March 2026)', () => {
    const now = new Date('2026-03-29T22:30:00Z'); // 00:30 on 30 March in Berlin; 24 hours earlier is still 28 March
    const groups = groupByDay([at('2026-03-29T10:00:00Z')], now, 'Europe/Berlin');
    expect(labels(groups)).toEqual(['Yesterday']);
  });

  it('puts an invalid timestamp in its own group instead of throwing', () => {
    const groups = groupByDay([at('not a date')], new Date('2026-10-09T10:00:00Z'), 'UTC');
    expect(labels(groups)).toEqual(['Unknown date']);
  });

  it('returns no groups for no events', () => {
    expect(groupByDay([], new Date('2026-10-09T10:00:00Z'), 'UTC')).toEqual([]);
  });
});
