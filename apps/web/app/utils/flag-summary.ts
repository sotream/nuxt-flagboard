import type { FlagEnvironmentView } from './api-types';

export type StatusTone = 'danger' | 'on' | 'partial' | 'off';

export interface EnvironmentSummary {
  label: string;
  tone: StatusTone;
}

/**
 * A short, honest description of one environment of a flag, in words (never colour alone):
 * kill switch, off, on for everyone, or on with a rollout and or rules.
 */
export function summarizeEnvironment(environment: FlagEnvironmentView): EnvironmentSummary {
  if (environment.killSwitch) {
    return { label: 'Kill switch', tone: 'danger' };
  }
  if (!environment.enabled) {
    return { label: 'Off', tone: 'off' };
  }
  const parts: string[] = [];
  const rules = environment.rules.length;
  if (rules > 0) parts.push(rules === 1 ? '1 rule' : `${rules} rules`);
  if (environment.rolloutPercentage < 100) parts.push(`${environment.rolloutPercentage}%`);
  return parts.length === 0
    ? { label: 'On', tone: 'on' }
    : { label: `On · ${parts.join(' · ')}`, tone: 'partial' };
}
