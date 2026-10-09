import { Expose, plainToInstance, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

const APP_ENVS = ['dev', 'prod'] as const;
export type AppEnv = (typeof APP_ENVS)[number];
const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

/** Every placeholder in `.env.example` contains this, so production can refuse them with one check. */
export const EXAMPLE_VALUE_MARKER = 'change-me';
const MIN_JWT_SECRET_LENGTH = 32;

/**
 * Typed, validated environment. There are no defaults for anything secret: a missing secret fails at startup.
 * `APP_ENV` (not `NODE_ENV`) decides dev or prod behaviour. Every field is `@Expose`d because validation
 * keeps only declared fields: the rest of `process.env` is dropped, so this object can never leak it.
 */
export class EnvironmentVariables {
  /** No default on purpose: an unset environment must not silently behave as dev or prod. */
  @Expose()
  @IsIn(APP_ENVS)
  APP_ENV!: AppEnv;

  @Expose()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 4010;

  /** The only origin allowed to call cookie endpoints (checked against the `Origin` header). */
  @Expose()
  @IsUrl({ require_tld: false })
  WEB_ORIGIN = 'http://localhost:3010';

  /** Connection string for the application role (`flagboard_app`), which has data access only. */
  @Expose()
  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @Expose()
  @IsIn(LOG_LEVELS)
  LOG_LEVEL = 'info';

  /** Signs access tokens (HS256). */
  @Expose()
  @IsString()
  @MinLength(MIN_JWT_SECRET_LENGTH)
  JWT_ACCESS_SECRET!: string;

  @Expose()
  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(3600)
  ACCESS_TOKEN_TTL_SECONDS = 900;

  @Expose()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  REFRESH_TOKEN_TTL_DAYS = 7;

  /** How long revoked refresh tokens are kept. Reuse detection needs them for as long as they could be replayed. */
  @Expose()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  REFRESH_REVOKED_RETENTION_DAYS = 14;

  @Expose()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  REFRESH_CLEANUP_INTERVAL_MINUTES = 60;

  @Expose()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  LOGIN_RATE_LIMIT_PER_MINUTE = 10;

  /** Requests per minute per API key on `/v1/*`. */
  @Expose()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  API_KEY_RATE_LIMIT_PER_MINUTE = 600;

  /** Failed key authentications per minute per client IP before further unknown keys get 429. */
  @Expose()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  KEY_AUTH_FAILURE_LIMIT_PER_MINUTE = 20;

  /**
   * Number of reverse proxies in front of the API whose `X-Forwarded-For` can be trusted. 0 (the default) means
   * the socket address is the client, so behind a proxy every client shares one rate-limit bucket.
   */
  @Expose()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  TRUST_PROXY_HOPS = 0;

  /** Live-update streams a user may keep open at once. A new one beyond this closes the oldest. */
  @Expose()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  SSE_MAX_STREAMS_PER_USER = 5;

  /** How often an idle stream sends a heartbeat, so proxies do not close it as idle. */
  @Expose()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(300)
  SSE_HEARTBEAT_SECONDS = 25;
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
  if (env.JWT_ACCESS_SECRET.includes(EXAMPLE_VALUE_MARKER)) {
    problems.push('JWT_ACCESS_SECRET still contains an example value');
  }
  return problems;
}

/**
 * Validates raw environment variables. The error message lists variable names and rules only, never values,
 * so a bad secret does not end up in logs.
 */
export function validateEnv(raw: Record<string, unknown>): EnvironmentVariables {
  const env = plainToInstance(EnvironmentVariables, raw, {
    excludeExtraneousValues: true,
    exposeDefaultValues: true,
  });
  const errors = validateSync(env, { skipMissingProperties: false });
  const problems = errors.flatMap((error) => Object.values(error.constraints ?? {}));
  if (errors.length === 0) {
    if (env.REFRESH_REVOKED_RETENTION_DAYS < env.REFRESH_TOKEN_TTL_DAYS) {
      problems.push('REFRESH_REVOKED_RETENTION_DAYS must not be below REFRESH_TOKEN_TTL_DAYS');
    }
    if (env.APP_ENV === 'prod') {
      problems.push(...productionProblems(env));
    }
  }
  if (problems.length > 0) {
    throw new Error(`Invalid environment:\n- ${problems.join('\n- ')}`);
  }
  return env;
}
