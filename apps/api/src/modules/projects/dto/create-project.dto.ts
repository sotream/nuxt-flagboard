import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export const PROJECT_KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export class CreateProjectDto {
  @IsString()
  @MaxLength(64)
  @Matches(PROJECT_KEY_PATTERN, {
    message: 'key must be lower-case letters and digits separated by single dashes',
  })
  key!: string;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;
}
