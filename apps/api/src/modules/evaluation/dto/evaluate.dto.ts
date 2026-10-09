import type { AttributeValue } from '@flagboard/core';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
  registerDecorator,
} from 'class-validator';
import type { ValidationOptions } from 'class-validator';
import { isAttributeValue } from '../../../common/validators/attribute-value.validator.js';

/** Bounds on what a public caller may send. Each one has a test. */
export const MAX_FLAGS_PER_REQUEST = 50;
export const MAX_FLAG_KEY_LENGTH = 64;
export const MAX_ATTRIBUTES = 20;
export const MAX_ATTRIBUTE_KEY_LENGTH = 64;
export const MAX_USER_ID_LENGTH = 128;
/** The JSON body limit for `/v1` (enforced in setup-app) is 16 KB. */
export const PUBLIC_BODY_LIMIT = '16kb';

function IsAttributes(options?: ValidationOptions) {
  return (target: object, propertyName: string): void => {
    registerDecorator({
      name: 'isAttributes',
      target: target.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be an object with at most ${MAX_ATTRIBUTES} attributes, keys up to ${MAX_ATTRIBUTE_KEY_LENGTH} characters, and string, number or boolean values`,
        ...options,
      },
      validator: {
        validate: (value: unknown) => {
          if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
          const entries = Object.entries(value);
          return (
            entries.length <= MAX_ATTRIBUTES &&
            entries.every(
              ([key, inner]) =>
                key.length >= 1 &&
                key.length <= MAX_ATTRIBUTE_KEY_LENGTH &&
                isAttributeValue(inner),
            )
          );
        },
      },
    });
  };
}

export class EvaluationContextDto {
  @ApiPropertyOptional({
    description: `Stable id of the user. Needed for percentage rollouts. Up to ${MAX_USER_ID_LENGTH} characters.`,
    example: 'user-42',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_USER_ID_LENGTH)
  userId?: string;

  @ApiPropertyOptional({
    description: `Attributes that targeting rules can match: at most ${MAX_ATTRIBUTES}, string, number or boolean values. Attributes sent by a client key are advisory: the client chooses them.`,
    example: { country: 'UA', plan: 'pro' },
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsAttributes()
  attributes?: Record<string, AttributeValue>;
}

export class EvaluateDto {
  @ApiPropertyOptional({ type: () => EvaluationContextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EvaluationContextDto)
  context?: EvaluationContextDto;

  @ApiPropertyOptional({
    description: `Flag keys to evaluate (at most ${MAX_FLAGS_PER_REQUEST}). Omit it to evaluate every flag the key may see.`,
    type: [String],
    example: ['new-checkout'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_FLAGS_PER_REQUEST)
  @IsString({ each: true })
  @MaxLength(MAX_FLAG_KEY_LENGTH, { each: true })
  flags?: string[];
}
