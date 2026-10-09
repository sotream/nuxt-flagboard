import { describe, expect, it } from 'vitest';
import type { AuditEventView } from '../../app/utils/api-types';
import { actionLabel } from '../../app/utils/audit-format';

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
