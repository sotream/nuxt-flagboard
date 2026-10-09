import { validateEnv } from './env.validation.js';

const valid = {
  APP_ENV: 'dev',
  DATABASE_URL: 'postgres://flagboard_app:pw@localhost:5434/flagboard',
  JWT_ACCESS_SECRET: 'a-test-secret-that-is-at-least-32-chars-long',
};

describe('validateEnv', () => {
  it('accepts a minimal environment and fills in defaults', () => {
    const env = validateEnv(valid);
    expect(env.PORT).toBe(4010);
    expect(env.WEB_ORIGIN).toBe('http://localhost:3010');
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.ACCESS_TOKEN_TTL_SECONDS).toBe(900);
    expect(env.REFRESH_TOKEN_TTL_DAYS).toBe(7);
    expect(env.LOGIN_RATE_LIMIT_PER_MINUTE).toBe(10);
  });

  it('keeps only declared variables, so unrelated secrets in the environment are dropped', () => {
    const env = validateEnv({
      ...valid,
      AWS_SECRET_ACCESS_KEY: 'unrelated-secret',
      HOME: '/home/me',
    });
    expect(Object.keys(env)).not.toContain('AWS_SECRET_ACCESS_KEY');
    expect(Object.keys(env)).not.toContain('HOME');
    expect(JSON.stringify(env)).not.toContain('unrelated-secret');
  });

  it('converts PORT from a string to a number', () => {
    expect(validateEnv({ ...valid, PORT: '5000' }).PORT).toBe(5000);
  });

  it.each([
    [
      'APP_ENV is missing',
      { DATABASE_URL: valid.DATABASE_URL, JWT_ACCESS_SECRET: valid.JWT_ACCESS_SECRET },
    ],
    ['JWT_ACCESS_SECRET is missing', { APP_ENV: 'dev', DATABASE_URL: valid.DATABASE_URL }],
    ['JWT_ACCESS_SECRET is too short', { ...valid, JWT_ACCESS_SECRET: 'short' }],
    ['APP_ENV is unknown', { ...valid, APP_ENV: 'staging' }],
    ['DATABASE_URL is missing', { APP_ENV: 'dev', JWT_ACCESS_SECRET: valid.JWT_ACCESS_SECRET }],
    ['PORT is not a port number', { ...valid, PORT: '70000' }],
    ['LOG_LEVEL is unknown', { ...valid, LOG_LEVEL: 'loud' }],
  ])('rejects the environment when %s', (_label, raw) => {
    expect(() => validateEnv(raw)).toThrow('Invalid environment');
  });

  it('names the broken variable but never prints its value', () => {
    const secret = 'super-secret-log-level-value';
    let message = '';
    try {
      validateEnv({ ...valid, LOG_LEVEL: secret });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('LOG_LEVEL');
    expect(message).not.toContain(secret);
  });

  describe('APP_ENV=prod', () => {
    const prod = {
      APP_ENV: 'prod',
      WEB_ORIGIN: 'https://flags.example.com',
      DATABASE_URL: 'postgres://flagboard_app:a-real-password@db:5432/flagboard',
      JWT_ACCESS_SECRET: 'a-production-secret-that-is-long-enough-1234',
    };

    it('accepts a safe production environment', () => {
      expect(() => validateEnv(prod)).not.toThrow();
    });

    it('rejects a non-https WEB_ORIGIN', () => {
      expect(() => validateEnv({ ...prod, WEB_ORIGIN: 'http://flags.example.com' })).toThrow(
        'WEB_ORIGIN must be an https URL',
      );
    });

    it('rejects an example JWT secret copied from .env.example', () => {
      expect(() =>
        validateEnv({ ...prod, JWT_ACCESS_SECRET: 'change-me-local-only-at-least-32-characters' }),
      ).toThrow('JWT_ACCESS_SECRET still contains an example value');
    });

    it('rejects example values copied from .env.example', () => {
      expect(() =>
        validateEnv({ ...prod, DATABASE_URL: 'postgres://u:change-me-local-only@db/flagboard' }),
      ).toThrow('DATABASE_URL still contains an example value');
    });
  });
});
