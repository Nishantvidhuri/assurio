import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { SubjectsService } from './subjects.service';
import { SubjectVerificationService } from './subject-verification.service';
import { VerifyService } from '../verify/verify.service';
import { UsersService } from '../users/users.service';
import { EmailService } from './email.service';
import { ConsentSettlementService } from '../wallet/consent-settlement.service';
import { WhatsAppService } from '../common/whatsapp.service';

/**
 * Public, token-based candidate verification flow — no login required. Reached
 * by an emailed link (`/verify/:token`, token = the subject's inviteToken). The
 * candidate agrees to the terms, confirms their details, and completes Aadhaar
 * via DigiLocker. Mirrors the public InviteController pattern (no JwtAuthGuard);
 * the token is validated on every call.
 */
@Controller('verify-link')
export class VerifyLinkController {
  private readonly logger = new Logger(VerifyLinkController.name);

  constructor(
    private readonly svc: SubjectsService,
    private readonly verify: VerifyService,
    private readonly users: UsersService,
    private readonly email: EmailService,
    private readonly settlement: ConsentSettlementService,
    private readonly subjectVerification: SubjectVerificationService,
    private readonly whatsapp: WhatsAppService,
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

  private async require(token: string, opts: { allowClosed?: boolean } = {}) {
    const doc = await this.svc.findByInviteToken(token);
    if (!doc) {
      throw new BadRequestException(
        'This verification link is invalid or has expired.',
      );
    }
    // Once consent is declined or the request expired, the wallet hold has
    // been refunded — every step that could trigger spend must go dead.
    if (
      !opts.allowClosed &&
      (doc.consentStatus === 'DECLINED' || doc.consentStatus === 'EXPIRED')
    ) {
      throw new BadRequestException(
        'This verification was declined or has expired and is now closed.',
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
    // allowClosed: the page must still render the declined/expired end state.
    const doc = await this.require(token, { allowClosed: true });
    const client = await this.users.findById(doc.userId);
    const consent = (doc.consentResult ?? {}) as Record<string, unknown>;
    const aadhaarVerified = this.aadhaarOk(doc.aadhaarResult);
    return {
      candidateName: doc.name,
      consentStatus: doc.consentStatus,
      // What will be verified once consent is granted — shown on the consent
      // step so the candidate knows exactly what they are agreeing to.
      checks: this.subjectVerification.plannedChecks(doc),
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

  /**
   * Candidate ticks the Terms & Conditions. Winning the PENDING → GRANTED
   * transition is what starts the paid checks — exactly once, ever: repeats
   * return 'already' and do NOT re-trigger vendor calls, and a link whose
   * consent was declined/expired is rejected before reaching here.
   */
  @Post(':token/consent')
  async consent(@Param('token') token: string) {
    const doc = await this.require(token);
    const outcome = await this.settlement.grantConsent(doc.id);
    if (outcome === 'closed' || outcome === 'missing') {
      throw new BadRequestException(
        'This verification was declined or has expired and is now closed.',
      );
    }
    const prev = (doc.consentResult ?? {}) as Record<string, unknown>;
    await this.svc.patchOwn(doc.id, {
      consentResult: {
        ...prev,
        mode: 'TERMS',
        agreedTerms: true,
        acceptedAt: new Date().toISOString(),
      },
    });
    if (outcome === 'granted') {
      // Consent settled → the hold is now consumed; run the paid checks.
      this.subjectVerification.runForSubject(doc.id);
      // Only the winning transition notifies, so a double-click can't send twice.
      void this.notifyConsent(doc.id, 'accepted');
    }
    return { ok: true };
  }

  /** WhatsApp the client that their wallet hold came back. */
  private async notifyRefund(
    subjectId: string,
    refundedPaise: number,
  ): Promise<void> {
    try {
      const doc = await this.svc.findById(subjectId);
      if (!doc) return;
      const client = await this.users.findById(doc.userId);
      if (!client?.phone) return;
      await this.whatsapp.sendRefundProcessed(
        client.phone,
        client.name,
        doc.name,
        Math.round(refundedPaise / 100),
      );
    } catch (e) {
      this.logger.warn(
        `WhatsApp refund notify failed for ${subjectId}: ${
          e instanceof Error ? e.message : e
        }`,
      );
    }
  }

  /**
   * WhatsApp on a settled consent decision: confirmation to the candidate and
   * notification to the client. Fire-and-forget — never breaks the response.
   */
  private async notifyConsent(
    subjectId: string,
    outcome: 'accepted' | 'declined',
  ): Promise<void> {
    try {
      const doc = await this.svc.findById(subjectId);
      if (!doc) return;
      const client = await this.users.findById(doc.userId);
      const clientName = client?.name ?? 'Your employer';

      if (doc.phone) {
        await (outcome === 'accepted'
          ? this.whatsapp.sendVerificationAcceptedToCandidate(
              doc.phone,
              doc.name,
              clientName,
            )
          : this.whatsapp.sendVerificationDeclinedToCandidate(
              doc.phone,
              doc.name,
              clientName,
            ));
      }
      if (client?.phone) {
        await (outcome === 'accepted'
          ? this.whatsapp.sendConsentAcceptedToClient(
              client.phone,
              clientName,
              doc.name,
            )
          : this.whatsapp.sendConsentDeclinedToClient(
              client.phone,
              clientName,
              doc.name,
            ));
      }
    } catch (e) {
      this.logger.warn(
        `WhatsApp consent notify failed for ${subjectId}: ${
          e instanceof Error ? e.message : e
        }`,
      );
    }
  }

  /**
   * Candidate declines. Atomically closes the case and returns the client's
   * wallet hold — the conditional transition + unique refund key make this
   * exactly-once even if clicked twice or raced against the expiry sweep.
   */
  @Post(':token/decline')
  async decline(@Param('token') token: string) {
    const doc = await this.require(token, { allowClosed: true });
    if (doc.consentStatus === 'GRANTED') {
      throw new BadRequestException(
        'Consent was already given — this verification is in progress.',
      );
    }
    const res = await this.settlement.decline(doc.id);
    // decline() is exactly-once, so this can't double-send on a repeat click.
    if (res.refundedPaise > 0 || doc.consentStatus === 'PENDING') {
      void this.notifyConsent(doc.id, 'declined');
      if (res.refundedPaise > 0) void this.notifyRefund(doc.id, res.refundedPaise);
    }
    return { ok: true, declined: true, refunded: res.refundedPaise > 0 };
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

    // Aadhaar just landed, which is the only source of the complete structured
    // address the credit bureau demands. Re-run the engine so any check that
    // was deferred for want of that address (credit) now fires. Idempotent:
    // checks with a stored result are skipped.
    this.subjectVerification.runForSubject(doc.id);

    return { ok: true, aadhaar: result };
  }
}
