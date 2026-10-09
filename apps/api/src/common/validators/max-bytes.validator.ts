import { registerDecorator } from 'class-validator';
import type { ValidationOptions } from 'class-validator';

/** The string must be at most `max` bytes in UTF-8 (not characters). */
export function MaxBytes(max: number, options?: ValidationOptions) {
  return (target: object, propertyName: string): void => {
    registerDecorator({
      name: 'maxBytes',
      target: target.constructor,
      propertyName,
      constraints: [max],
      options: { message: `${propertyName} must be at most ${max} bytes`, ...options },
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= max,
      },
    });
  };
}
