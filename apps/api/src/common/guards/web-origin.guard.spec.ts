import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { EnvironmentVariables } from '../../infrastructure/config/env.validation.js';
import { WebOriginGuard } from './web-origin.guard.js';

const contextWith = (origin: string | undefined): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ headers: { origin } }) }),
  }) as unknown as ExecutionContext;

describe('WebOriginGuard', () => {
  const guard = new WebOriginGuard({
    WEB_ORIGIN: 'https://flags.example.com/',
  } as EnvironmentVariables);

  it('accepts the configured origin (a trailing slash in the setting does not matter)', () => {
    expect(guard.canActivate(contextWith('https://flags.example.com'))).toBe(true);
  });

  it.each([
    ['a different origin', 'https://evil.example.com'],
    ['a different scheme', 'http://flags.example.com'],
    ['a different port', 'https://flags.example.com:8443'],
    ['a lookalike subdomain', 'https://flags.example.com.evil.io'],
    ['the string null', 'null'],
    ['a missing header', undefined],
  ])('rejects %s', (_label, origin) => {
    expect(() => guard.canActivate(contextWith(origin))).toThrow(ForbiddenException);
  });
});
