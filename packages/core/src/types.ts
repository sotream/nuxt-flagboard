/** A value a context attribute can hold. Rule comparison is strict: `"1"` is not `1`. */
export type AttributeValue = string | number | boolean;

export interface Context {
  userId?: string;
  attributes?: Record<string, AttributeValue>;
}

export type Condition =
  | { attribute: string; operator: 'equals'; value: AttributeValue }
  | { attribute: string; operator: 'in'; values: AttributeValue[] };

/** All conditions must match (AND). Rules are tried in order and the first match wins. */
export interface Rule {
  conditions: Condition[];
  serve: 'on' | 'off';
}

export type FlagValue = boolean | string;

/** A flag as it is evaluated in one environment (one entry of a snapshot). */
export interface FlagConfig {
  key: string;
  type: 'boolean' | 'string';
  onValue: FlagValue;
  offValue: FlagValue;
  /** Random, immutable. Makes rollout cohorts differ between flags. */
  salt: string;
  enabled: boolean;
  /** Integer 0..100. 0 serves the off value to everyone, 100 serves the on value to everyone. */
  rolloutPercentage: number;
  rules: Rule[];
  killSwitch: boolean;
}

/** `ERROR` is only produced by the SDK when a request fails; core never returns it. */
export const REASONS = [
  'KILL_SWITCH',
  'DISABLED',
  'RULE_MATCH',
  'ROLLOUT_IN',
  'ROLLOUT_OUT',
  'ROLLOUT_NO_USER_ID',
  'DEFAULT',
  'FLAG_NOT_FOUND',
  'ERROR',
] as const;

export type Reason = (typeof REASONS)[number];

export interface EvaluationResult {
  value: FlagValue;
  reason: Reason;
  /** Position of the matching rule; only set for `RULE_MATCH`. */
  ruleIndex?: number;
}
