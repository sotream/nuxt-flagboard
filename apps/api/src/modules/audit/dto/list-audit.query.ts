import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export const DEFAULT_AUDIT_PAGE_SIZE = 50;

export class ListAuditQuery {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  flagKey?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  /** The `nextCursor` of the previous page. */
  @IsOptional()
  @IsUUID()
  cursor?: string;
}
