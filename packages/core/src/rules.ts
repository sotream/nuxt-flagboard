import type { AttributeValue, Condition, Context, Rule } from './types.js';

function matchesCondition(condition: Condition, attributes: Context['attributes']): boolean {
  if (!attributes || !Object.hasOwn(attributes, condition.attribute)) {
    return false;
  }
  const actual: AttributeValue | undefined = attributes[condition.attribute];
  return condition.operator === 'equals'
    ? actual === condition.value
    : condition.values.some((value) => value === actual);
}

/**
 * True when every condition matches. Comparison is strict (`===`), a missing attribute never matches, and a
 * rule with no conditions never matches (the API rejects it; this keeps core safe on bad data).
 */
export function matchesRule(rule: Rule, context: Context): boolean {
  return (
    rule.conditions.length > 0 &&
    rule.conditions.every((condition) => matchesCondition(condition, context.attributes))
  );
}
