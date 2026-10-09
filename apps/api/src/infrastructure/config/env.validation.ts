import { plainToInstance, Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsString, IsUrl, Max, Min, validateSync } from 'class-validator';

const APP_ENVS = ['dev', 'prod'] as const;
export type AppEnv = (typeof APP_ENVS)[number];
const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

/** Every placeholder in `.env.example` contains this, so production can refuse them with one check. */
export const EXAMPLE_VALUE_MARKER = 'change-me';

/**
 * Typed, validated environment. There are no defaults for anything secret: a missing secret fails at startup.
 * `APP_ENV` (not `NODE_ENV`) decides dev or prod behaviour.
 */
export class EnvironmentVariables {
  /** No default on purpose: an unset environment must not silently behave as dev or prod. */
  @IsIn(APP_ENVS)
  APP_ENV!: AppEnv;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 4000;

  /** The only origin allowed to call cookie endpoints (checked against the `Origin` header). */
  @IsUrl({ require_tld: false })
  WEB_ORIGIN = 'http://localhost:3000';

  /** Connection string for the application role (`flagboard_app`), which has data access only. */
  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsIn(LOG_LEVELS)
  LOG_LEVEL = 'info';
}

/** Reasons the environment is not safe for `APP_ENV=prod`. Never includes the offending values. */
export function productionProblems(env: EnvironmentVariables): string[] {
  const problems: string[] = [];
  if (!env.WEB_ORIGIN.startsWith('https://')) {
    problems.push('WEB_ORIGIN must be an https URL');
  }
  if (env.DATABASE_URL.includes(EXAMPLE_VALUE_MARKER)) {
    problems.push('DATABASE_URL still contains an example value');
  }
  return problems;
}

/**
 * Validates raw environment variables. The error message lists variable names and rules only, never values,
 * so a bad secret does not end up in logs.
 */
export function validateEnv(raw: Record<string, unknown>): EnvironmentVariables {
  const env = plainToInstance(EnvironmentVariables, raw, { exposeDefaultValues: true });
  const errors = validateSync(env, { skipMissingProperties: false });
  const problems = errors.flatMap((error) => Object.values(error.constraints ?? {}));
  if (env.APP_ENV === 'prod' && errors.length === 0) {
    problems.push(...productionProblems(env));
  }
  if (problems.length > 0) {
    throw new Error(`Invalid environment:\n- ${problems.join('\n- ')}`);
  }
  return env;
}
