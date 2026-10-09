import { readSeedConfig } from './seed-config.js';

const valid = { APP_ENV: 'dev', SEED_ADMIN_PASSWORD: 'a-long-admin-password' };

describe('readSeedConfig', () => {
  it('reads the admin password from the environment and defaults the emails', () => {
    expect(readSeedConfig(valid)).toEqual({
      adminEmail: 'admin@example.com',
      adminPassword: 'a-long-admin-password',
      viewerEmail: 'viewer@example.com',
      viewerPassword: undefined,
    });
  });

  it('refuses to run in production', () => {
    expect(() => readSeedConfig({ ...valid, APP_ENV: 'prod' })).toThrow('APP_ENV=dev');
  });

  it('refuses to run when APP_ENV is not set', () => {
    expect(() => readSeedConfig({ SEED_ADMIN_PASSWORD: valid.SEED_ADMIN_PASSWORD })).toThrow(
      'APP_ENV=dev',
    );
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['too short', 'short-pw'],
  ])('requires an admin password: %s', (_label, password) => {
    expect(() => readSeedConfig({ APP_ENV: 'dev', SEED_ADMIN_PASSWORD: password })).toThrow(
      'SEED_ADMIN_PASSWORD is required',
    );
  });

  it('creates a viewer only when a viewer password is given, and checks its length', () => {
    expect(
      readSeedConfig({ ...valid, SEED_VIEWER_PASSWORD: 'a-long-viewer-password' }).viewerPassword,
    ).toBe('a-long-viewer-password');
    expect(() => readSeedConfig({ ...valid, SEED_VIEWER_PASSWORD: 'short' })).toThrow(
      'SEED_VIEWER_PASSWORD',
    );
  });

  it('lets the emails be overridden and normalises them', () => {
    expect(readSeedConfig({ ...valid, SEED_ADMIN_EMAIL: ' Boss@Example.com ' }).adminEmail).toBe(
      'boss@example.com',
    );
  });
});
