import { refreshCookieOptions, REFRESH_COOKIE_PATH } from './auth.constants.js';

describe('refreshCookieOptions', () => {
  it('is httpOnly, SameSite=Lax and limited to the auth path', () => {
    expect(refreshCookieOptions({ APP_ENV: 'dev', REFRESH_TOKEN_TTL_DAYS: 7 })).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    expect(REFRESH_COOKIE_PATH).toBe('/api/v1/auth');
  });

  it('is Secure in production only', () => {
    expect(refreshCookieOptions({ APP_ENV: 'prod', REFRESH_TOKEN_TTL_DAYS: 7 }).secure).toBe(true);
    expect(refreshCookieOptions({ APP_ENV: 'dev', REFRESH_TOKEN_TTL_DAYS: 7 }).secure).toBe(false);
  });
});
