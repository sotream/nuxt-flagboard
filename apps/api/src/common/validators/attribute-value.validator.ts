import { registerDecorator } from 'class-validator';
import type { ValidationOptions } from 'class-validator';

export const MAX_ATTRIBUTE_STRING_LENGTH = 256;

/** A rule operand: a string (at most 256 characters), a finite number or a boolean. */
export const isAttributeValue = (value: unknown): boolean =>
  (typeof value === 'string' && value.length <= MAX_ATTRIBUTE_STRING_LENGTH) ||
  (typeof value === 'number' && Number.isFinite(value)) ||
  typeof value === 'boolean';

export function IsAttributeValue(options?: ValidationOptions) {
  return (target: object, propertyName: string): void => {
    registerDecorator({
      name: 'isAttributeValue',
      target: target.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be a string up to ${MAX_ATTRIBUTE_STRING_LENGTH} characters, a number or a boolean`,
        ...options,
      },
      validator: { validate: isAttributeValue },
    });
  };
}
