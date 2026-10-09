import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ListProjectsQuery {
  /** Case-insensitive substring of the key or the name. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
