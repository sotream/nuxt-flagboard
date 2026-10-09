import { Injectable } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { ThrottlerLimitDetail } from '@nestjs/throttler';
import type { Response } from 'express';

/**
 * The stock guard names the header after the throttler (`Retry-After-login`). Clients and SDKs look for the
 * standard `Retry-After` (seconds), so it is set on every 429.
 */
@Injectable()
export class RetryAfterThrottlerGuard extends ThrottlerGuard {
  protected override throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const seconds = Math.max(1, detail.isBlocked ? detail.timeToBlockExpire : detail.timeToExpire);
    context.switchToHttp().getResponse<Response>().setHeader('Retry-After', String(seconds));
    return super.throwThrottlingException(context, detail);
  }
}
