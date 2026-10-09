import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { RevisionDto } from './update-flag-environment.dto.js';

export class EngageKillSwitchDto extends RevisionDto {
  /** Why the flag is being switched off. Required, and kept in the audit log. */
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}
