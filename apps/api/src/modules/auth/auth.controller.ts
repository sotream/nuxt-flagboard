import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator.js';
import { WebOriginGuard } from '../../common/guards/web-origin.guard.js';
import { ADMIN_PREFIX } from '../../common/routes.js';
import { EnvironmentVariables } from '../../infrastructure/config/env.validation.js';
import { RateLimit } from '../../infrastructure/rate-limit/rate-limit.decorator.js';
import { refreshCookieOptions, REFRESH_COOKIE } from './auth.constants.js';
import { AuthService } from './auth.service.js';
import type { AuthResult, PublicUser } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';

interface SessionResponse {
  accessToken: string;
  expiresIn: number;
  user: PublicUser;
}

/**
 * Sign-in, refresh and sign-out. These routes are public (there is no access token yet) and are called from
 * the web app only, so each one checks the `Origin` header.
 */
@Controller(`${ADMIN_PREFIX}/auth`)
@Public()
@UseGuards(WebOriginGuard)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly env: EnvironmentVariables,
  ) {}

  @Post('login')
  @HttpCode(200)
  @RateLimit('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponse> {
    return this.respond(response, await this.auth.login(dto.email, dto.password));
  }

  @Post('refresh')
  @HttpCode(200)
  @RateLimit('session')
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponse> {
    const presented = this.presentedToken(request);
    if (!presented) {
      throw new UnauthorizedException('Missing refresh token');
    }
    try {
      return this.respond(response, await this.auth.refresh(presented));
    } catch (error) {
      this.clearCookie(response);
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(204)
  @RateLimit('session')
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const presented = this.presentedToken(request);
    if (presented) {
      await this.auth.logout(presented);
    }
    this.clearCookie(response);
  }

  private respond(response: Response, result: AuthResult): SessionResponse {
    response.cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions(this.env));
    response.setHeader('Cache-Control', 'no-store');
    return { accessToken: result.accessToken, expiresIn: result.expiresIn, user: result.user };
  }

  private clearCookie(response: Response): void {
    // Express 5 ignores maxAge when clearing; path, SameSite and Secure must match for browsers to drop it.
    response.clearCookie(REFRESH_COOKIE, refreshCookieOptions(this.env));
  }

  private presentedToken(request: Request): string | undefined {
    const value: unknown = request.cookies?.[REFRESH_COOKIE];
    return typeof value === 'string' && value !== '' ? value : undefined;
  }
}
