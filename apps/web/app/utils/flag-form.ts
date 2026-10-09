import { FLAG_KEY_PATTERN } from './slugify';

export interface FlagFormValues {
  name: string;
  key: string;
  type: 'boolean' | 'string';
  onValue: string;
  offValue: string;
}

export type FlagFormErrors = Partial<Record<'name' | 'key' | 'onValue' | 'offValue', string>>;

/** The order the fields appear in, so focus can go to the first one with a problem. */
export const FLAG_FORM_FIELD_ORDER = ['name', 'key', 'onValue', 'offValue'] as const;

const checkName = (name: string): string | undefined => {
  const trimmed = name.trim();
  if (trimmed === '') return 'Enter a name.';
  return trimmed.length > 120 ? 'Use at most 120 characters.' : undefined;
};

const checkKey = (key: string): string | undefined =>
  FLAG_KEY_PATTERN.test(key) && key.length <= 64
    ? undefined
    : 'Use lower-case letters and digits, separated by single dots, dashes or underscores (up to 64 characters).';

const checkValue = (value: string, when: 'on' | 'off'): string | undefined => {
  if (value === '') return `Enter the value served when the flag is ${when}.`;
  return value.length > 256 ? 'Use at most 256 characters.' : undefined;
};

/** The same rules the API applies, so the person hears about a problem before the request is made. */
export function validateNewFlag(values: FlagFormValues): FlagFormErrors {
  const errors: FlagFormErrors = {};
  errors.name = checkName(values.name);
  errors.key = checkKey(values.key);
  if (values.type === 'string') {
    errors.onValue = checkValue(values.onValue, 'on');
    errors.offValue = checkValue(values.offValue, 'off');
    if (!errors.onValue && !errors.offValue && values.onValue === values.offValue) {
      errors.offValue = 'The on and off values must be different.';
    }
  }
  for (const field of FLAG_FORM_FIELD_ORDER) {
    if (errors[field] === undefined) delete errors[field];
  }
  return errors;
}
