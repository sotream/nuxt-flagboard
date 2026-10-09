import { Transform } from 'class-transformer';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { ENVIRONMENT_KEYS } from '../../projects/entities/environment.entity.js';
import type { EnvironmentKey } from '../../projects/entities/environment.entity.js';
import { API_KEY_KINDS } from '../api-key.js';
import type { ApiKeyKind } from '../api-key.js';

export class CreateApiKeyDto {
  @IsIn(ENVIRONMENT_KEYS)
  environment!: EnvironmentKey;

  /** `server` can read the snapshot and evaluate; `client` can only evaluate flags marked client-visible. */
  @IsIn(API_KEY_KINDS)
  kind!: ApiKeyKind;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;
}
