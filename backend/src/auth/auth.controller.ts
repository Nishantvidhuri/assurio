import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { CsrfGuard } from './csrf.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LoginDto, SignupDto } from './dto';
import { setAuthCookies, clearAuthCookies, setCsrfCookie } from './cookies';



// ─── Rate-limit policy for auth endpoints ─────────────────────────────────
// ThrottlerGuard is applied at the controller level so every route is covered.
// Individual routes override the defaults with @Throttle() as needed.
// Limits are deliberately conservative — legitimate users hit them rarely.
//   login / signup / forgot-password / reset  → auth-strict  (10 req / 60 s)
//   csrf / logout / me                        → auth-loose   (30 req / 60 s)
// ──────────────────────────────────────────────────────────────────────────

@UseGuards(ThrottlerGuard)
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Returns a fresh CSRF token and sets the as_csrf cookie.
   *  Call this once on app load before any mutation. */
  @Get('csrf')
  @Throttle({ 'auth-loose': { limit: 30, ttl: 60_000 } })
  csrf(@Res({ passthrough: true }) res: Response) {
    return { csrfToken: setCsrfCookie(res) };
  }

  @Post('signup')
  @Throttle({ 'auth-strict': { limit: 5, ttl: 60_000 } })
  async signup(
    @Body() dto: SignupDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.signup(dto.name, dto.email, dto.password);
    setAuthCookies(res, result.token);
    return { user: result.user };
  }

  @Post('login')
  @Throttle({ 'auth-strict': { limit: 10, ttl: 60_000 } })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(dto.email, dto.password);
    setAuthCookies(res, result.token);
    return { user: result.user };
  }

  @Post('logout')
  @UseGuards(CsrfGuard)
  @Throttle({ 'auth-loose': { limit: 20, ttl: 60_000 } })
  logout(@Res({ passthrough: true }) res: Response) {
    clearAuthCookies(res);
    return { ok: true };
  }

  /** Public — always resolves; the response is identical whether or not the
   *  email exists (so we don't leak which accounts are registered). */
  @Post('forgot-password')
  @Throttle({ 'auth-strict': { limit: 3, ttl: 300_000 } })  // 3 per 5 min — email flood prevention
  async forgotPassword(@Body() body: { email?: string }) {
    await this.auth.forgotPassword((body.email || '').trim());
    return { ok: true };
  }

  @Get('reset/:token')
  @Throttle({ 'auth-strict': { limit: 10, ttl: 60_000 } })
  resetInfo(@Param('token') token: string) {
    return this.auth.resetInfo(token);
  }

  @Post('reset/:token')
  @Throttle({ 'auth-strict': { limit: 5, ttl: 60_000 } })
  async resetPassword(
    @Param('token') token: string,
    @Body() body: { password?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.resetPassword(
      token,
      (body.password || '').trim(),
    );
    setAuthCookies(res, result.token);
    return { user: result.user };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @SkipThrottle({ 'auth-strict': true, 'auth-loose': true })
  async me(@Req() req: Request) {
    return this.auth.getMe((req as Request & { user: { sub: string; role?: string } }).user);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard, CsrfGuard)
  @SkipThrottle({ 'auth-strict': true, 'auth-loose': true })
  async updateMe(
    @Req() req: Request,
    @Body() body: { phone?: string },
  ) {
    const user = (req as Request & { user: { sub: string; role?: string } }).user;
    return this.auth.updateMe(user, body);
  }
}
