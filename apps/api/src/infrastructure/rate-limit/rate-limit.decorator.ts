import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rateLimit';

/** Names of the throttling policies. A route opts in to exactly one; routes without one are not limited here. */
export type RateLimitPolicy = 'login' | 'session';

export const RateLimit = (policy: RateLimitPolicy): MethodDecorator & ClassDecorator =>
  SetMetadata(RATE_LIMIT_KEY, policy);
