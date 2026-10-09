import { Module } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { EnvironmentVariables } from '../config/env.validation.js';
import { RATE_LIMIT_KEY } from './rate-limit.decorator.js';
import type { RateLimitPolicy } from './rate-limit.decorator.js';

const reflector = new Reflector();

/** A throttler applies only to routes that are tagged with its policy. */
const skipUnless =
  (policy: RateLimitPolicy) =>
  (context: ExecutionContext): boolean =>
    reflector.getAllAndOverride<RateLimitPolicy | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) !== policy;

/**
 * In-memory counters (a single API instance, see the single-instance ADR). They reset on restart and are
 * not shared between replicas; counting is per client IP.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [EnvironmentVariables],
      useFactory: (env: EnvironmentVariables) => ({
        throttlers: [
          {
            name: 'login',
            ttl: 60_000,
            limit: env.LOGIN_RATE_LIMIT_PER_MINUTE,
            skipIf: skipUnless('login'),
          },
        ],
      }),
    }),
  ],
  exports: [ThrottlerModule],
})
export class RateLimitModule {}
