import { BUCKETS, bucket } from './bucket.js';
import { matchesRule } from './rules.js';
import type { Context, EvaluationResult, FlagConfig, FlagValue } from './types.js';

function evaluateRollout(flag: FlagConfig, context: Context): EvaluationResult | undefined {
  const percentage = Number.isFinite(flag.rolloutPercentage) ? flag.rolloutPercentage : 0;
  if (percentage >= 100) {
    return { value: flag.onValue, reason: 'ROLLOUT_IN' };
  }
  if (percentage <= 0) {
    return undefined;
  }
  // A partial rollout needs a stable identity to bucket; without one nobody is rolled in.
  if (typeof context.userId !== 'string' || context.userId === '') {
    return { value: flag.offValue, reason: 'ROLLOUT_NO_USER_ID' };
  }
  const inRollout = bucket(flag.salt, context.userId) < (percentage * BUCKETS) / 100;
  return inRollout
    ? { value: flag.onValue, reason: 'ROLLOUT_IN' }
    : { value: flag.offValue, reason: 'ROLLOUT_OUT' };
}

/**
 * Evaluates one flag for one context. Order, first hit wins:
 * 1. kill switch, 2. disabled, 3. rules in order, 4. percentage rollout, 5. default (the off value).
 * An unknown or archived flag (`undefined`) returns the caller's default with `FLAG_NOT_FOUND`.
 * Pure and synchronous: the API and the SDK call this same function, so they always agree.
 */
export function evaluate(
  flag: FlagConfig | undefined,
  context: Context,
  defaultValue: FlagValue,
): EvaluationResult {
  if (!flag) {
    return { value: defaultValue, reason: 'FLAG_NOT_FOUND' };
  }
  if (flag.killSwitch) {
    return { value: flag.offValue, reason: 'KILL_SWITCH' };
  }
  if (!flag.enabled) {
    return { value: flag.offValue, reason: 'DISABLED' };
  }
  const ruleIndex = flag.rules.findIndex((rule) => matchesRule(rule, context));
  const rule = flag.rules[ruleIndex];
  if (rule) {
    return {
      value: rule.serve === 'on' ? flag.onValue : flag.offValue,
      reason: 'RULE_MATCH',
      ruleIndex,
    };
  }
  return evaluateRollout(flag, context) ?? { value: flag.offValue, reason: 'DEFAULT' };
}
