import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsStringOrBoolean } from '../../../common/validators/string-or-boolean.validator.js';
import type { FlagType } from '../flag-values.js';

export const FLAG_KEY_PATTERN = /^[a-z0-9]+([._-][a-z0-9]+)*$/;
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateFlagDto {
  @IsString()
  @MaxLength(64)
  @Matches(FLAG_KEY_PATTERN, {
    message:
      'key must be lower-case letters and digits separated by single dots, dashes or underscores',
  })
  key!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsIn(['boolean', 'string'])
  type!: FlagType;

  /** Defaults to true for boolean flags; required for string flags. */
  @IsOptional()
  @IsStringOrBoolean()
  onValue?: string | boolean;

  /** Defaults to false for boolean flags; required for string flags. */
  @IsOptional()
  @IsStringOrBoolean()
  offValue?: string | boolean;

  @IsOptional()
  @IsBoolean()
  clientVisible?: boolean;
}
