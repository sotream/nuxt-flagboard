import type { CookieOptions } from 'express';
import { ADMIN_PREFIX } from '../../common/routes.js';
import type { EnvironmentVariables } from '../../infrastructure/config/env.validation.js';

export const REFRESH_COOKIE = 'flagboard_refresh';

/**
 * Claims every access token carries and every verification checks (RFC 8725 §3.8, §3.9). There is one issuer and one
 * audience today, so this is defence in depth: a token minted for something else with the same key is rejected.
 */
export const JWT_ISSUER = 'flagboard';
export const JWT_AUDIENCE = 'flagboard-admin-api';
export const JWT_ALGORITHM = 'HS256';
/** The cookie is only sent to the auth endpoints, never to the rest of the API. */
export const REFRESH_COOKIE_PATH = `/${ADMIN_PREFIX}/auth`;
const DAY_MS = 24 * 60 * 60 * 1000;

/** `Secure` is on in production only, because local development runs over plain http. */
export function refreshCookieOptions(
  env: Pick<EnvironmentVariables, 'APP_ENV' | 'REFRESH_TOKEN_TTL_DAYS'>,
): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.APP_ENV === 'prod',
    path: REFRESH_COOKIE_PATH,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * DAY_MS,
  };
}
