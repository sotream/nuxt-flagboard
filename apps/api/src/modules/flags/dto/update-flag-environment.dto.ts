import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { MAX_RULES, RuleDto } from './rule.dto.js';

export class RevisionDto {
  /** The revision you last read. If someone else changed the state since, the update is rejected with 409. */
  @IsInt()
  @Min(1)
  revision!: number;
}

export class UpdateFlagEnvironmentDto extends RevisionDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  rolloutPercentage?: number;

  /** Replaces the whole list. Rules are tried in order and the first match wins. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_RULES)
  @ValidateNested({ each: true })
  @Type(() => RuleDto)
  rules?: RuleDto[];
}
