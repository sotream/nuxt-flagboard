import type { AttributeValue, Condition, Rule } from '@flagboard/core';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { IsAttributeValue } from '../../../common/validators/attribute-value.validator.js';

export const MAX_RULES = 20;
export const MAX_CONDITIONS_PER_RULE = 10;
export const MAX_IN_VALUES = 50;

export class ConditionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_.:-]+$/, {
    message: 'attribute may only contain letters, digits and _ . : -',
  })
  attribute!: string;

  @IsIn(['equals', 'in'])
  operator!: 'equals' | 'in';

  @ValidateIf((condition: ConditionDto) => condition.operator === 'equals')
  @IsAttributeValue()
  value?: AttributeValue;

  @ValidateIf((condition: ConditionDto) => condition.operator === 'in')
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_IN_VALUES)
  @IsAttributeValue({ each: true })
  values?: AttributeValue[];
}

export class RuleDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_CONDITIONS_PER_RULE)
  @ValidateNested({ each: true })
  @Type(() => ConditionDto)
  conditions!: ConditionDto[];

  @IsIn(['on', 'off'])
  serve!: 'on' | 'off';
}

/**
 * Builds the stored rule explicitly, so a stray `values` on an `equals` condition (or `value` on an `in`) that
 * the validator ignored can never end up in the database.
 */
export function toRule(dto: RuleDto): Rule {
  return {
    conditions: dto.conditions.map((condition): Condition =>
      condition.operator === 'equals'
        ? {
            attribute: condition.attribute,
            operator: 'equals',
            value: condition.value as AttributeValue,
          }
        : {
            attribute: condition.attribute,
            operator: 'in',
            values: condition.values as AttributeValue[],
          },
    ),
    serve: dto.serve,
  };
}
