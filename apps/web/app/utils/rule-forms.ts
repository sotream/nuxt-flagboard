import type { AttributeValue, Condition, Rule } from './api-types';

export type ValueType = 'text' | 'number' | 'boolean';

/** One condition as the form holds it: the value is always text, and `valueType` says how to read it. */
export interface ConditionForm {
  attribute: string;
  operator: 'equals' | 'in';
  valueType: ValueType;
  /** For `in`, several values separated by commas. */
  value: string;
}

export interface RuleForm {
  conditions: ConditionForm[];
  serve: 'on' | 'off';
}

export interface ConditionErrors {
  attribute?: string;
  value?: string;
}
export interface RuleErrors {
  conditions: ConditionErrors[];
  /** A problem with the rule as a whole (no conditions, too many). */
  rule?: string;
}

/** The same limits the API enforces. */
export const LIMITS = {
  rules: 20,
  conditionsPerRule: 10,
  inValues: 50,
  attribute: 64,
  text: 256,
} as const;
const ATTRIBUTE_PATTERN = /^[A-Za-z0-9_.:-]+$/;

export const emptyCondition = (): ConditionForm => ({
  attribute: '',
  operator: 'equals',
  valueType: 'text',
  value: '',
});
export const emptyRule = (): RuleForm => ({ conditions: [emptyCondition()], serve: 'on' });

const typeOf = (value: AttributeValue | undefined): ValueType =>
  typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'text';

/** Turns saved rules into form values the person can edit. */
export function toRuleForms(rules: Rule[]): RuleForm[] {
  return rules.map((rule) => ({
    serve: rule.serve,
    conditions: rule.conditions.map((condition): ConditionForm =>
      condition.operator === 'equals'
        ? {
            attribute: condition.attribute,
            operator: 'equals',
            valueType: typeOf(condition.value),
            value: String(condition.value),
          }
        : {
            attribute: condition.attribute,
            operator: 'in',
            valueType: typeOf(condition.values[0]),
            value: condition.values.map(String).join(', '),
          },
    ),
  }));
}

/** Reads one typed value from text. Returns the value, or a message saying what is wrong with it. */
function readValue(text: string, type: ValueType): { value: AttributeValue } | { error: string } {
  if (type === 'boolean') {
    return text === 'true' || text === 'false'
      ? { value: text === 'true' }
      : { error: 'Choose true or false.' };
  }
  if (type === 'number') {
    const trimmed = text.trim();
    const number = Number(trimmed);
    return trimmed !== '' && Number.isFinite(number)
      ? { value: number }
      : { error: `"${text.trim()}" is not a number.` };
  }
  if (text === '') return { error: 'Enter a value.' };
  return text.length > LIMITS.text
    ? { error: `Use at most ${LIMITS.text} characters.` }
    : { value: text };
}

function readAttribute(raw: string): { attribute: string; error?: string } {
  const attribute = raw.trim();
  if (attribute === '') return { attribute, error: 'Enter an attribute name.' };
  if (attribute.length > LIMITS.attribute)
    return { attribute, error: `Use at most ${LIMITS.attribute} characters.` };
  if (!ATTRIBUTE_PATTERN.test(attribute))
    return { attribute, error: 'Use letters, digits and _ . : - only.' };
  return { attribute };
}

/** The values of an `in` list: comma separated, spaces and empty entries ignored. */
function readList(text: string, type: ValueType): { values: AttributeValue[] } | { error: string } {
  const tokens = text
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token !== '');
  if (tokens.length === 0) return { error: 'Enter at least one value, separated by commas.' };
  if (tokens.length > LIMITS.inValues) return { error: `Use at most ${LIMITS.inValues} values.` };
  const values: AttributeValue[] = [];
  for (const token of tokens) {
    const read = readValue(token, type);
    if ('error' in read) return { error: read.error };
    values.push(read.value);
  }
  return { values };
}

function readCondition(form: ConditionForm): { condition?: Condition; errors: ConditionErrors } {
  const errors: ConditionErrors = {};
  const { attribute, error: attributeError } = readAttribute(form.attribute);
  if (attributeError) errors.attribute = attributeError;

  if (form.operator === 'equals') {
    const read = readValue(form.value, form.valueType);
    if ('error' in read) errors.value = read.error;
    if (errors.attribute || 'error' in read) return { errors };
    return { condition: { attribute, operator: 'equals', value: read.value }, errors };
  }

  const read = readList(form.value, form.valueType);
  if ('error' in read) errors.value = read.error;
  if (errors.attribute || 'error' in read) return { errors };
  return { condition: { attribute, operator: 'in', values: read.values }, errors };
}

function readRule(form: RuleForm): { rule: Rule; errors: RuleErrors; valid: boolean } {
  const errors: RuleErrors = { conditions: [] };
  const conditions: Condition[] = [];
  if (form.conditions.length === 0) errors.rule = 'Add at least one condition.';
  if (form.conditions.length > LIMITS.conditionsPerRule) {
    errors.rule = `Use at most ${LIMITS.conditionsPerRule} conditions in a rule.`;
  }
  for (const conditionForm of form.conditions) {
    const read = readCondition(conditionForm);
    errors.conditions.push(read.errors);
    if (read.condition) conditions.push(read.condition);
  }
  const valid = !errors.rule && errors.conditions.every((e) => !e.attribute && !e.value);
  return { rule: { conditions, serve: form.serve }, errors, valid };
}

/**
 * Turns the form values into rules for the API, or the problems to show. Valid only when there are no problems at
 * all; `rules` is then ready to send.
 */
export function toRules(forms: RuleForm[]): {
  rules: Rule[];
  errors: RuleErrors[];
  valid: boolean;
} {
  const read = forms.map(readRule);
  return {
    rules: read.map((r) => r.rule),
    errors: read.map((r) => r.errors),
    valid: forms.length <= LIMITS.rules && read.every((r) => r.valid),
  };
}
