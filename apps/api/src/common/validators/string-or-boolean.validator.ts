import { registerDecorator } from 'class-validator';
import type { ValidationOptions } from 'class-validator';

/** The value must be a string or a boolean (JSON booleans only: the string "true" is a string). */
export function IsStringOrBoolean(options?: ValidationOptions) {
  return (target: object, propertyName: string): void => {
    registerDecorator({
      name: 'isStringOrBoolean',
      target: target.constructor,
      propertyName,
      options: { message: `${propertyName} must be a string or a boolean`, ...options },
      validator: {
        validate: (value: unknown) => typeof value === 'string' || typeof value === 'boolean',
      },
    });
  };
}
