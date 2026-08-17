import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma.service';
import { User } from '../../../generated/prisma/client';

/**
 * Google sign-in via the OAuth authorization-code (popup) flow.
 *
 * Security model:
 *  • The browser only ever holds a one-time authorization code — the client
 *    secret lives here and the code is exchanged server-side.
 *  • The resulting ID token is verified with Google's public keys
 *    (signature, issuer, expiry) and its audience checked against OUR client
 *    id, so a token minted for another app can never log in here.
 *  • Only Google-verified emails may link to an existing account — an
 *    unverified address can't be used to take over someone's login.
 *  • Accounts are matched by the stable `sub` claim first; the verified email
 *    is only a fallback for first-time linking of existing password accounts.
 *  • Accounts born via Google get a random unusable password hash, so
 *    password login stays impossible until the user sets one via reset.
 */
@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);
  private readonly client: OAuth2Client | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      this.logger.warn(
        'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not configured — Google sign-in disabled.',
      );
      return;
    }
    // 'postmessage' is the fixed redirect for the GIS popup code flow.
    this.client = new OAuth2Client(clientId, clientSecret, 'postmessage');
  }

  get isConfigured(): boolean {
    return this.client !== null;
  }

  /** Exchange the popup's authorization code and sign the user in. */
  async signInWithCode(code: string) {
    if (!this.client) {
      throw new BadRequestException(
        'Google sign-in is not configured on the server.',
      );
    }
    if (!code || typeof code !== 'string' || code.length > 512) {
      throw new BadRequestException('Missing Google authorization code');
    }

    // 1. Code → tokens (server-side; requires the client secret).
    let idToken: string | undefined;
    try {
      const { tokens } = await this.client.getToken(code);
      idToken = tokens.id_token ?? undefined;
    } catch {
      // Expired/reused/foreign codes all land here — no detail leaks.
      throw new UnauthorizedException('Google sign-in failed. Please try again.');
    }
    if (!idToken) {
      throw new UnauthorizedException('Google sign-in failed. Please try again.');
    }

    // 2. Verify the ID token (signature, issuer, expiry, audience = us).
    const ticket = await this.client
      .verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID })
      .catch(() => {
        throw new UnauthorizedException('Google sign-in failed. Please try again.');
      });
    const payload = ticket.getPayload();
    const email = payload?.email?.toLowerCase().trim();
    if (!payload?.sub || !email) {
      throw new UnauthorizedException('Google sign-in failed. Please try again.');
    }
    if (!payload.email_verified) {
      throw new UnauthorizedException(
        'This Google account’s email is not verified.',
      );
    }

    const user = await this.findOrCreateUser(payload.sub, email, payload.name);
    return this.issueSession(user);
  }

  private async findOrCreateUser(
    googleSub: string,
    email: string,
    name?: string,
  ): Promise<User> {
    // Stable link first — survives email changes on the Google account.
    const bySub = await this.prisma.user.findUnique({
      where: { googleId: googleSub },
    });
    if (bySub) return bySub;

    // First Google login for an existing password account: link it. Safe
    // because Google has verified the email belongs to this person.
    const byEmail = await this.prisma.user.findUnique({ where: { email } });
    if (byEmail) {
      if (byEmail.googleId && byEmail.googleId !== googleSub) {
        // Same email, different Google account — never silently re-link.
        throw new ConflictException(
          'This email is already linked to a different Google account.',
        );
      }
      return this.prisma.user.update({
        where: { id: byEmail.id },
        data: { googleId: googleSub },
      });
    }

    // Brand-new account. The random hash makes password login impossible
    // until the user explicitly sets one via the reset flow.
    const unusablePassword = await bcrypt.hash(
      randomBytes(32).toString('hex'),
      10,
    );
    return this.prisma.user.create({
      data: {
        name: (name || email.split('@')[0]).trim().slice(0, 120),
        email,
        passwordHash: unusablePassword,
        googleId: googleSub,
      },
    });
  }

  private issueSession(user: User) {
    const role = user.role || 'owner';
    const token = this.jwt.sign({ sub: user.id, email: user.email, role });
    return {
      token,
      user: { id: user.id, name: user.name, email: user.email, role },
    };
  }
}
