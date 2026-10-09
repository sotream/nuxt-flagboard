import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Metadata only. The key, type, values and salt never change after creation. */
export class UpdateFlagDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  clientVisible?: boolean;

  /** `true` archives the flag, `false` restores it. */
  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}
