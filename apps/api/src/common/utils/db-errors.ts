import { QueryFailedError } from 'typeorm';

const UNIQUE_VIOLATION = '23505';

/** True when PostgreSQL rejected a write because of a unique constraint. */
export function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }
  return (error.driverError as { code?: string } | undefined)?.code === UNIQUE_VIOLATION;
}
