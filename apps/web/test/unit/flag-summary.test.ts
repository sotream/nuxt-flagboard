import { describe, expect, it } from 'vitest';
import type { FlagEnvironmentView } from '../../app/utils/api-types';
import { summarizeEnvironment } from '../../app/utils/flag-summary';

const environment = (overrides: Partial<FlagEnvironmentView> = {}): FlagEnvironmentView => ({
  environment: 'dev',
  enabled: true,
  rolloutPercentage: 100,
  rules: [],
  killSwitch: false,
  killReason: null,
  revision: 1,
  updatedAt: '2026-10-01T10:00:00.000Z',
  ...overrides,
});
const rule = {
  conditions: [{ attribute: 'country', operator: 'equals' as const, value: 'UA' }],
  serve: 'on' as const,
};

describe('summarizeEnvironment', () => {
  it('says Off for a disabled flag', () => {
    expect(summarizeEnvironment(environment({ enabled: false }))).toEqual({
      label: 'Off',
      tone: 'off',
    });
  });

  it('says On for a flag that is on for everyone', () => {
    expect(summarizeEnvironment(environment())).toEqual({ label: 'On', tone: 'on' });
  });

  it('shows the rollout percentage', () => {
    expect(summarizeEnvironment(environment({ rolloutPercentage: 25 }))).toEqual({
      label: 'On · 25%',
      tone: 'partial',
    });
    expect(summarizeEnvironment(environment({ rolloutPercentage: 0 })).label).toBe('On · 0%');
  });

  it('shows the number of rules', () => {
    expect(summarizeEnvironment(environment({ rules: [rule] })).label).toBe('On · 1 rule');
    expect(summarizeEnvironment(environment({ rules: [rule, rule] })).label).toBe('On · 2 rules');
  });

  it('combines rules and a partial rollout', () => {
    expect(summarizeEnvironment(environment({ rules: [rule], rolloutPercentage: 10 })).label).toBe(
      'On · 1 rule · 10%',
    );
  });

  it('puts the kill switch above everything else', () => {
    expect(summarizeEnvironment(environment({ killSwitch: true, enabled: true }))).toEqual({
      label: 'Kill switch',
      tone: 'danger',
    });
    expect(summarizeEnvironment(environment({ killSwitch: true, enabled: false })).tone).toBe(
      'danger',
    );
  });
});
