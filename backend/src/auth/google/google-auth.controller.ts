import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { GoogleAuthService } from './google-auth.service';
import { setAuthCookies } from '../cookies';

/**
 * POST /auth/google — completes the GIS popup code flow. Issues the exact same
 * httpOnly session cookies as email login, so everything downstream (guards,
 * CSRF, /auth/me) is identical regardless of how the user signed in.
 */
@UseGuards(ThrottlerGuard)
@Controller('auth')
export class GoogleAuthController {
  constructor(private readonly google: GoogleAuthService) {}

  @Post('google')
  @Throttle({ 'auth-strict': { limit: 10, ttl: 60_000 } })
  async signIn(
    @Body() body: { code?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.google.signInWithCode(body.code ?? '');
    setAuthCookies(res, result.token);
    return { user: result.user };
  }
}
