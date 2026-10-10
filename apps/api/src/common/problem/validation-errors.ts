import { BadRequestException } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import type { FieldError } from './problem-details.js';
import { pointerToken } from './problem-details.js';

/** Flattens class-validator's tree into one entry per violated constraint, with the path of the field as a pointer. */
export function fieldErrors(errors: ValidationError[], parent = '#'): FieldError[] {
  return errors.flatMap((error) => {
    const pointer = `${parent}/${pointerToken(error.property)}`;
    const own = Object.values(error.constraints ?? {}).map((detail) => ({ pointer, detail }));
    return [...own, ...fieldErrors(error.children ?? [], pointer)];
  });
}

/** For `ValidationPipe`: the 400 lists all field errors, not just the first. */
export function validationException(errors: ValidationError[]): BadRequestException {
  return new BadRequestException({
    code: 'VALIDATION_FAILED',
    message: 'The request is not valid. See errors for each field.',
    errors: fieldErrors(errors),
  });
}
