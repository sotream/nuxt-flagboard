import { describe, expect, it } from 'vitest';
import type { AuditEventView } from '../../app/utils/api-types';
import { actionLabel, describeChanges, formatValue } from '../../app/utils/audit-format';

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

describe('actionLabel', () => {
  it.each([
    ['project.created', 'Created the project'],
    ['flag.created', 'Created the flag'],
    ['flag.environment.updated', 'Changed an environment'],
    ['flag.kill_switch.enabled', 'Switched the kill switch on'],
    ['flag.kill_switch.disabled', 'Released the kill switch'],
    ['api_key.created', 'Created an API key'],
    ['api_key.revoked', 'Revoked an API key'],
  ])('says what %s means', (action, text) => {
    expect(actionLabel(event({ action }))).toBe(text);
  });

  it('tells archiving and restoring apart', () => {
    expect(actionLabel(event({ action: 'flag.archived', after: { archived: true } }))).toBe(
      'Archived the flag',
    );
    expect(actionLabel(event({ action: 'flag.archived', after: { archived: false } }))).toBe(
      'Restored the flag',
    );
  });

  it('shows an unknown action as it is instead of hiding it', () => {
    expect(actionLabel(event({ action: 'something.new' }))).toBe('something.new');
  });
});

describe('formatValue', () => {
  it.each([
    ['enabled', true, 'yes'],
    ['enabled', false, 'no'],
    ['rolloutPercentage', 25, '25'],
    ['name', 'New checkout', 'New checkout'],
    ['killReason', null, '—'],
    ['killReason', undefined, '—'],
    ['rules', [], '0 rules'],
    ['rules', [{}], '1 rule'],
    ['rules', [{}, {}], '2 rules'],
    ['other', { a: 1 }, '{"a":1}'],
  ])('formats %s = %j as %j', (field, value, text) => {
    expect(formatValue(field, value)).toBe(text);
  });
});

describe('describeChanges', () => {
  it('lists only the fields that changed, with old and new values', () => {
    const changes = describeChanges(
      event({
        before: { enabled: false, rolloutPercentage: 0 },
        after: { enabled: true, rolloutPercentage: 0 },
      }),
    );
    expect(changes).toEqual([{ field: 'enabled', label: 'Enabled', before: 'no', after: 'yes' }]);
  });

  it('shows a creation as fields appearing from nothing', () => {
    const changes = describeChanges(
      event({ before: null, after: { key: 'new-checkout', type: 'boolean' } }),
    );
    expect(changes).toEqual([
      { field: 'key', label: 'Key', before: '—', after: 'new-checkout' },
      { field: 'type', label: 'Type', before: '—', after: 'boolean' },
    ]);
  });

  it('shows a removed field going to nothing', () => {
    expect(
      describeChanges(event({ before: { killReason: 'Incident' }, after: { killReason: null } })),
    ).toEqual([
      { field: 'killReason', label: 'Kill switch reason', before: 'Incident', after: '—' },
    ]);
  });

  it('summarises rules as a count and detects a change inside them', () => {
    const rule = { serve: 'on', conditions: [] };
    expect(describeChanges(event({ before: { rules: [] }, after: { rules: [rule] } }))).toEqual([
      { field: 'rules', label: 'Rules', before: '0 rules', after: '1 rule' },
    ]);
    expect(
      describeChanges(
        event({ before: { rules: [rule] }, after: { rules: [{ ...rule, serve: 'off' }] } }),
      ),
    ).toHaveLength(1);
  });

  it('does not report a rule list that is the same', () => {
    const rule = { serve: 'on', conditions: [] };
    expect(describeChanges(event({ before: { rules: [rule] }, after: { rules: [rule] } }))).toEqual(
      [],
    );
  });

  it('copes with events that carry no before or after', () => {
    expect(describeChanges(event({ before: null, after: null }))).toEqual([]);
  });

  it('keeps an unknown field, labelled by its own name', () => {
    expect(describeChanges(event({ before: null, after: { brandNew: 1 } }))[0]).toMatchObject({
      label: 'brandNew',
      after: '1',
    });
  });
});
