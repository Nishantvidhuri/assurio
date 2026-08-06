import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { SubjectsService } from './subjects.service';
import { VerifyService } from '../verify/verify.service';
import { UsersService } from '../users/users.service';
import { EmailService } from './email.service';

/**
 * Public, token-based candidate verification flow — no login required. Reached
 * by an emailed link (`/verify/:token`, token = the subject's inviteToken). The
 * candidate agrees to the terms, confirms their details, and completes Aadhaar
 * via DigiLocker. Mirrors the public InviteController pattern (no JwtAuthGuard);
 * the token is validated on every call.
 */
@Controller('verify-link')
export class VerifyLinkController {
  constructor(
    private readonly svc: SubjectsService,
    private readonly verify: VerifyService,
    private readonly users: UsersService,
    private readonly email: EmailService,
  ) {}

  /**
   * Demo: create a throwaway candidate for the given email and send them a real
   * verification email whose link opens the real /verify/:token flow. Returns
   * the link so the demo page can show/open it too.
   */
  @Post('demo')
  async demo(@Body() body: { email?: string; name?: string }) {
    const email = (body.email || '').trim();
    if (!/.+@.+\..+/.test(email)) {
      throw new BadRequestException('Enter a valid email address.');
    }
    const subject = await this.svc.createDemoSubject(
      email,
      (body.name || '').trim(),
    );
    const baseUrl =
      process.env.PUBLIC_APP_URL?.replace(/\/$/, '') ||
      process.env.APP_URL ||
      'http://localhost:3000';
    const url = `${baseUrl}/verify/${subject.inviteToken}`;
    const emailSent = await this.email.sendVerificationLink(
      email,
      subject.name,
      'Demo Company',
      url,
    );
    return { url, emailSent };
  }

  private async require(token: string) {
    const doc = await this.svc.findByInviteToken(token);
    if (!doc) {
      throw new BadRequestException(
        'This verification link is invalid or has expired.',
      );
    }
    return doc;
  }

  private aadhaarOk(result: unknown): boolean {
    return Boolean(
      result &&
        typeof result === 'object' &&
        !('__checkError' in (result as object)),
    );
  }

  /** Who the link is for + the current progress of the flow. */
  @Get(':token')
  async info(@Param('token') token: string) {
    const doc = await this.require(token);
    const client = await this.users.findById(doc.userId);
    const consent = (doc.consentResult ?? {}) as Record<string, unknown>;
    const aadhaarVerified = this.aadhaarOk(doc.aadhaarResult);
    return {
      candidateName: doc.name,
      clientName: client?.name ?? 'Your employer',
      email: doc.email ?? '',
      phone: doc.phone ?? '',
      aadhaarNumber: doc.aadhaarNumber ?? '',
      termsAccepted: Boolean(consent.agreedTerms),
      digilockerStarted: Boolean(doc.digilockerClientId),
      // The DigiLocker client_id generated for this candidate on initialize.
      digilockerClientId: doc.digilockerClientId ?? null,
      aadhaarVerified,
      // The stored KYC ("xml data") — name, DOB, gender, masked Aadhaar,
      // address. The document image (photo) is never stored, so it stays null.
      aadhaar: aadhaarVerified ? doc.aadhaarResult : null,
    };
  }

  /** Candidate ticks the Terms & Conditions. */
  @Post(':token/consent')
  async consent(@Param('token') token: string) {
    const doc = await this.require(token);
    const prev = (doc.consentResult ?? {}) as Record<string, unknown>;
    await this.svc.patchOwn(doc.id, {
      consentResult: {
        ...prev,
        mode: 'TERMS',
        agreedTerms: true,
        acceptedAt: new Date().toISOString(),
      },
    });
    return { ok: true };
  }

  /** Candidate confirms their details (name, mobile, email, Aadhaar number). */
  @Patch(':token')
  async update(
    @Param('token') token: string,
    @Body()
    body: { name?: string; email?: string; phone?: string; aadhaarNumber?: string },
  ) {
    const doc = await this.require(token);
    const patch: Record<string, unknown> = {};
    if (typeof body.name === 'string' && body.name.trim()) {
      patch.name = body.name.trim();
    }
    if (typeof body.email === 'string') patch.email = body.email.trim();
    if (typeof body.phone === 'string') patch.phone = body.phone.trim();
    if (typeof body.aadhaarNumber === 'string') {
      patch.aadhaarNumber = body.aadhaarNumber.replace(/\s+/g, '').trim() || null;
    }
    await this.svc.patchOwn(doc.id, patch);
    return { ok: true };
  }

  /** Kick off a DigiLocker session → returns the URL to open. */
  @Post(':token/digilocker/initialize')
  async dlInit(@Param('token') token: string) {
    const doc = await this.require(token);
    const init = (await this.verify.digilockerInitialize()) as {
      client_id?: string;
      url?: string;
    };
    const clientId = init?.client_id ?? null;
    const url = init?.url ?? null;
    await this.svc.patchOwn(doc.id, {
      digilockerClientId: clientId,
      digilockerUrl: url,
      aadhaarResult: null, // starting fresh
    });
    return { clientId, url };
  }

  /** Poll the DigiLocker consent status. */
  @Get(':token/digilocker/status')
  async dlStatus(@Param('token') token: string) {
    const doc = await this.require(token);
    if (!doc.digilockerClientId) {
      throw new BadRequestException('DigiLocker has not been started yet.');
    }
    return this.verify.digilockerStatus(doc.digilockerClientId);
  }

  /**
   * Fetch the eAadhaar once DigiLocker consent is complete.
   *
   * Privacy: we store the structured KYC ("xml data" — name, DOB, gender,
   * masked Aadhaar, address) so it can be shown, but we do NOT store the
   * document itself: the photo / profile image is dropped before persisting.
   * The full KYC (incl. photo) is returned to the candidate in this response
   * for their own confirmation and is never written to the database.
   */
  @Post(':token/digilocker/aadhaar')
  async dlAadhaar(@Param('token') token: string) {
    const doc = await this.require(token);
    if (!doc.digilockerClientId) {
      throw new BadRequestException('DigiLocker has not been started yet.');
    }
    const result = await this.verify.digilockerAadhaar(doc.digilockerClientId);
    await this.svc.patchOwn(doc.id, {
      aadhaarResult: {
        verified: true,
        verifiedAt: new Date().toISOString(),
        uidMasked: result.uidMasked ?? null,
        name: result.name ?? null,
        dob: result.dob ?? null,
        gender: result.gender ?? null,
        address: result.address ?? null,
        // The document image is never stored.
        photo: null,
      } as unknown as Record<string, unknown>,
    });
    return { ok: true, aadhaar: result };
  }
}
