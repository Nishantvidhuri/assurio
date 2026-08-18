import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Logger,
  MessageEvent,
  Param,
  Patch,
  Post,
  Req,
  Res,
  Sse,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EmailService } from './email.service';
import { EventsService } from '../common/events.service';
import { toSubjectResponse } from './subject-response';
import {
  renderSubjectReportHtml,
  renderReportFooter,
} from './subject-report-html';
import {
  mockReportSubject,
  MOCK_VARIANTS,
  type MockVariant,
} from './subject-report-mock';
import {
  SubjectPatch,
  SubjectPaymentInput,
  SubjectsService,
} from './subjects.service';
import { SubjectVerificationService } from './subject-verification.service';
import { CrimeSubmitDto } from './crime-submit.dto';
import { ConsentSettlementService } from '../wallet/consent-settlement.service';
import { UsersService } from '../users/users.service';
import { PdfService } from '../common/pdf.service';
import { S3Service } from '../common/s3.service';
import { WhatsAppService } from '../common/whatsapp.service';
import type { Subject } from '../../generated/prisma/client';

/** Check type → the Subject result column an admin override writes to. */
const MANUAL_PASS_FIELDS: Record<string, string> = {
  pan: 'panResult',
  aadhaar: 'aadhaarResult',
  voter: 'voterResult',
  passport: 'passportResult',
  dl: 'dlResult',
  employment: 'employmentResult',
  crime: 'crimeResult',
  credit: 'creditResult',
};
import { resolveReportImages as resolveReportImagesFn } from './report-images';
import {
  isReportStale,
  ReportGenerationService,
} from './report-generation.service';

interface RequestWithUser extends Request {
  user?: { sub?: string; role?: string };
}

const OWNER_PATCH_FIELDS: ReadonlyArray<keyof SubjectPatch> = [
  'name',
  'role',
  'email',
  'phone',
  'panFront',
  'panBack',
  'panNumber',
  'aadhaarFront',
  'aadhaarBack',
  'aadhaarNumber',
  'panResult',
  'aadhaarResult',
  'digilockerClientId',
  'digilockerUrl',
  'crimeRequestId',
  'crimeResult',
  'status',
];

@Controller('subjects')
@UseGuards(JwtAuthGuard)
export class SubjectsController {
  private readonly logger = new Logger(SubjectsController.name);

  constructor(
    private readonly svc: SubjectsService,
    private readonly email: EmailService,
    private readonly users: UsersService,
    private readonly events: EventsService,
    private readonly subjectVerification: SubjectVerificationService,
    private readonly pdf: PdfService,
    private readonly s3: S3Service,
    private readonly reportGen: ReportGenerationService,
    private readonly settlement: ConsentSettlementService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  /**
   * Resolve the stored document images (S3 keys after the durable-upload port,
   * or legacy base64) into browser/PDF-loadable URLs for the report. Returns a
   * shallow copy with the four image fields + the consent signature presigned.
   */
  private async resolveReportImages<
    T extends {
      panFront?: string | null;
      panBack?: string | null;
      aadhaarFront?: string | null;
      aadhaarBack?: string | null;
      consentResult?: unknown;
    },
  >(subject: T): Promise<T> {
    return resolveReportImagesFn(this.s3, subject);
  }

  @Get()
  async list(@Req() req: RequestWithUser) {
    const userId = this.requireOwner(req);
    const docs = await this.svc.list(userId);
    return docs.map((d) => toSubjectResponse(d));
  }

  @Post()
  async create(
    @Req() req: RequestWithUser,
    @Body()
    body: {
      name?: string;
      role?: string;
      email?: string;
      phone?: string;
      panNumber?: string;
      aadhaarNumber?: string;
      dob?: string;
      fatherName?: string;
      permanentAddress?: string;
      pincode?: string;
      drivingLicense?: string;
      voterId?: string;
      passportFileNo?: string;
      uan?: string;
      consentAcceptedAt?: string;
      payment?: SubjectPaymentInput;
    },
  ) {
    const userId = this.requireOwner(req);
    const name = (body.name || '').trim();
    const email = (body.email || '').trim();
    if (!name) throw new BadRequestException('Name is required');
    // Email is optional — but if provided it must be well-formed.
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Enter a valid email');
    }

    // Per-candidate consent: record when the requester attested consent. Fall
    // back to now (the box is a hard gate on the form, so consent was given).
    const parsedConsent = body.consentAcceptedAt
      ? new Date(body.consentAcceptedAt)
      : null;
    const consentAcceptedAt =
      parsedConsent && !Number.isNaN(parsedConsent.getTime())
        ? parsedConsent
        : new Date();

    const data = {
      name,
      role: body.role,
      email,
      phone: body.phone,
      panNumber: body.panNumber,
      aadhaarNumber: body.aadhaarNumber,
      dob: body.dob,
      fatherName: body.fatherName,
      permanentAddress: body.permanentAddress,
      pincode: body.pincode,
      drivingLicense: body.drivingLicense,
      voterId: body.voterId,
      passportFileNo: body.passportFileNo,
      uan: body.uan,
      consentAcceptedAt,
    };

    // With payment info the create + charge happen in one transaction and the
    // charge becomes a refundable hold (see SubjectsService.createWithPayment).
    const doc = body.payment
      ? await this.svc.createWithPayment(userId, data, body.payment)
      : await this.svc.create(userId, data);

    // Build the report immediately so it exists the moment payment lands —
    // every check shown as awaiting consent. Each vendor result that arrives
    // later regenerates it (debounced), so viewers always stream a stored PDF
    // instead of triggering a live render.
    this.reportGen.generateNow(doc.id);

    // Auto-run checks only once consent is settled: subjects with a candidate
    // email start PENDING and their checks fire when the candidate agrees
    // (verify-link / candidate dashboard). Vendor spend before consent would
    // make the money-back guarantee impossible.
    if (doc.consentStatus === 'GRANTED') {
      this.subjectVerification.runForSubject(doc.id);
    }

    const response = toSubjectResponse(doc);

    // Email the candidate the consent flow (/verify/:token) — terms → details
    // → Aadhaar — not the set-password page. Consent is what unblocks the paid
    // checks, so that is the first thing we ask them for.
    let emailSent = false;
    const client = await this.users.findById(userId);
    const baseUrl =
      process.env.PUBLIC_APP_URL?.replace(/\/$/, '') ||
      process.env.APP_URL ||
      'http://localhost:3000';

    if (doc.email && doc.inviteToken) {
      emailSent = await this.email.sendVerificationLink(
        doc.email,
        doc.name,
        client?.name ?? 'Your employer',
        `${baseUrl}/verify/${doc.inviteToken}`,
      );
    }

    // Same moment, on WhatsApp: the candidate gets the consent invite with the
    // list of checks, and the client gets confirmation the candidate was added.
    // Fire-and-forget — a WhatsApp hiccup must never fail the paid create.
    void this.notifyOnCreate(doc, client?.name ?? 'Your employer', client?.phone, baseUrl);

    return { ...response, emailSent };
  }

  /**
   * WhatsApp notifications sent the moment a candidate is created (i.e. when
   * the client pays): the consent invite to the candidate, and an added-to-your-
   * account confirmation to the client. Never throws — WhatsApp is a courtesy
   * channel and must not break the create/payment response.
   */
  private async notifyOnCreate(
    doc: Subject,
    clientName: string,
    clientPhone: string | null | undefined,
    baseUrl: string,
  ): Promise<void> {
    try {
      if (doc.phone && doc.inviteToken) {
        const checks = this.subjectVerification
          .plannedChecks(doc)
          .map((c) => c.label);
        await this.whatsapp.sendVerificationRequested(
          doc.phone,
          doc.name,
          clientName,
          checks,
          `${baseUrl}/verify/${doc.inviteToken}`,
        );
      }
      if (clientPhone) {
        await this.whatsapp.sendCandidateCreated(clientPhone, clientName, {
          name: doc.name,
          role: doc.role || undefined,
          email: doc.email,
          phone: doc.phone || undefined,
        });
      }
    } catch (e) {
      this.logger.warn(
        `WhatsApp notify failed for subject ${doc.id}: ${
          e instanceof Error ? e.message : e
        }`,
      );
    }
  }

  @Get(':id')
  async getOne(@Req() req: RequestWithUser, @Param('id') id: string) {
    const userId = this.requireOwner(req);
    const doc = await this.svc.findOwned(userId, id);
    const payment = await this.svc.paymentInfo(doc);
    // Presign the stored document images (S3 keys) so the owner's report can
    // render them; legacy base64 passes through untouched.
    return { ...toSubjectResponse(await this.resolveReportImages(doc)), ...payment };
  }

  @Patch(':id')
  async patch(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    const userId = this.requireOwner(req);
    const patch: SubjectPatch = {};
    for (const key of Object.keys(body)) {
      if (OWNER_PATCH_FIELDS.includes(key as keyof SubjectPatch)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (patch as any)[key] = body[key];
      }
    }

    // Detect newly-started checks BEFORE applying — so we email the
    // candidate the first time the owner sets the result for each check.
    const before = await this.svc.findOwned(userId, id);
    const newChecks: string[] = [];
    if ('panResult' in patch && patch.panResult && !before.panResult) {
      newChecks.push('PAN');
    }
    if (
      'crimeRequestId' in patch &&
      patch.crimeRequestId &&
      !before.crimeRequestId
    ) {
      newChecks.push('Crime');
    }

    const doc = await this.svc.patch(userId, id, patch);

    // Fire-and-forget candidate notifications (email).
    for (const label of newChecks) {
      if (doc.email) {
        this.email.sendCheckStarted(doc.email, doc.name, label)
          .catch((err: unknown) => this.logger.error(`Email check-started (${label}) failed`, err));
      }
    }

    return toSubjectResponse(doc);
  }

  @Delete(':id')
  async remove(@Req() req: RequestWithUser, @Param('id') id: string) {
    const userId = this.requireOwner(req);
    await this.svc.findOwned(userId, id);
    // Deleting a candidate whose consent is still pending closes the case and
    // returns the hold to the wallet — otherwise the money would be stranded
    // (charged, never spent, never refundable). No-op unless still PENDING.
    const settled = await this.settlement.refundOnDelete(id);
    await this.svc.remove(userId, id);
    return { ok: true, refundedPaise: settled.refundedPaise };
  }

  /**
   * Force-re-run a single ID check ("Recall API"). Owners can recall their own
   * candidates; admins can recall any. Crime/credit are excluded server-side
   * (only the five sync ID checks are accepted).
   */
  @Post(':id/recheck/:type')
  async recheck(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Param('type') type: string,
  ) {
    if (req.user?.role === 'candidate') {
      throw new ForbiddenException('Account holder access required');
    }
    // Owners must own the candidate; admins may recall any.
    if (req.user?.role !== 'admin') {
      await this.svc.findOwned(this.requireOwner(req), id);
    }
    const allowed = [
      'pan',
      'aadhaar',
      'voter',
      'passport',
      'dl',
      'employment',
      // Async vendor-polled: recall clears the stored result and re-submits.
      'crime',
      'credit',
    ] as const;
    if (!(allowed as readonly string[]).includes(type)) {
      throw new BadRequestException('Unsupported check type');
    }
    const doc = await this.subjectVerification.recheck(
      id,
      type as (typeof allowed)[number],
    );
    return toSubjectResponse(doc);
  }

  /**
   * Admin override: mark a single check as passed by hand when the vendor API
   * can't return a result (source down, record not digitised, a genuine no-match
   * the admin has verified offline).
   *
   * This does NOT fake a vendor success. It stores an attributed
   * `{ __manualOverride }` record — who passed it, when, and why — so the report
   * shows "Verified manually" rather than pretending the API answered. Storing a
   * result also makes the check count as done, so the verification can reach
   * 100% and the finished report goes out.
   */
  @Post(':id/manual-pass/:type')
  async manualPass(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Param('type') type: string,
    @Body() body: { reason?: string; resolution?: 'passed' | 'unable' },
  ) {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Admin only');
    }
    const field = MANUAL_PASS_FIELDS[type];
    if (!field) throw new BadRequestException('Unsupported check type');

    const admin = await this.users.findById(req.user.sub ?? '');
    const doc = await this.subjectVerification.manualPass(
      id,
      field,
      admin?.email || admin?.name || 'admin',
      (body?.reason || '').trim(),
      body?.resolution === 'unable' ? 'unable' : 'passed',
    );
    return toSubjectResponse(doc);
  }

  /**
   * Admin override: submit the crime check with fields typed by the operator
   * instead of the ones derived from the candidate record.
   *
   * Admin-only because it bypasses the derivation gate in run() — the gate that
   * stops a check being submitted (and billed) against incomplete data. An
   * operator taking that decision has to be accountable for it.
   */
  @Post(':id/crime-submit')
  async crimeSubmit(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() body: CrimeSubmitDto,
  ) {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Admin only');
    }
    const doc = await this.subjectVerification.submitCrimeManually(id, {
      name: body.name,
      fatherName: body.fatherName,
      dob: body.dob,
      address: body.address,
      panNumber: body.panNumber,
    });
    return toSubjectResponse(doc);
  }

  @Sse(':id/events')
  @UseGuards(JwtAuthGuard)
  streamSubject(
    @Param('id') id: string,
    @Res() res: Response,
  ): Observable<MessageEvent> {
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    return this.events.stream(this.events.subjectChannel(id));
  }

  /**
   * Email the candidate the public verification link (/verify/:token) — the
   * consent + details + Aadhaar (DigiLocker) flow. Owners can send for their own
   * candidates; admins for any.
   */
  @Post(':id/send-verification-link')
  async sendVerificationLink(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
  ) {
    if (req.user?.role === 'candidate') {
      throw new ForbiddenException('Account holder access required');
    }
    const doc =
      req.user?.role === 'admin'
        ? await this.svc.findById(id)
        : await this.svc.findOwned(this.requireOwner(req), id);
    if (!doc) throw new BadRequestException('Subject not found');
    if (!doc.email) {
      throw new BadRequestException('This candidate has no email on file.');
    }
    const [token, client] = await Promise.all([
      this.svc.ensureInviteToken(id),
      this.users.findById(doc.userId),
    ]);
    const baseUrl =
      process.env.PUBLIC_APP_URL?.replace(/\/$/, '') ||
      process.env.APP_URL ||
      'http://localhost:3000';
    const url = `${baseUrl}/verify/${token}`;
    const emailSent = await this.email.sendVerificationLink(
      doc.email,
      doc.name,
      client?.name ?? 'Your employer',
      url,
    );
    return { ok: true, emailSent, url };
  }

  /**
   * Mock report preview — renders a fully-populated sample report in one of three
   * states (success / pending / failed) so the layout can be reviewed without a
   * real candidate. Uses fabricated data only (no PII). Inline PDF.
   */
  @Get('report/mock/:variant')
  async mockReport(@Param('variant') variant: string, @Res() res: Response) {
    if (!MOCK_VARIANTS.includes(variant as MockVariant)) {
      throw new BadRequestException(
        `Unknown variant "${variant}" — expected one of: ${MOCK_VARIANTS.join(', ')}`,
      );
    }
    const subject = mockReportSubject(variant as MockVariant);
    const buffer = await this.pdf.htmlToPdf(renderSubjectReportHtml(subject), {
      printBackground: true,
      footerTemplate: renderReportFooter(subject),
      margin: { top: '10mm', bottom: '18mm', left: '12mm', right: '12mm' },
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="assurio-report-mock-${variant}.pdf"`,
    );
    res.send(buffer);
  }

  /**
   * Full Background Verification Report as a PDF (all eight checks). Owners can
   * download their own candidates; admins can download any. Opens inline by
   * default; pass ?download=1 for an attachment.
   */
  @Get(':id/report')
  async report(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    if (req.user?.role === 'candidate') {
      throw new ForbiddenException('Account holder access required');
    }
    // Admins may fetch any candidate; owners only their own.
    const doc =
      req.user?.role === 'admin'
        ? await this.svc.findById(id)
        : await this.svc.findOwned(this.requireOwner(req), id);
    if (!doc) throw new BadRequestException('Subject not found');

    let buffer: Buffer;
    if (
      doc.reportPdfS3Key &&
      !isReportStale(doc.reportPdfS3Key) &&
      this.s3.isConfigured
    ) {
      // Serve the pre-generated PDF from S3 — kept fresh by the background
      // report-generation job on every status update.
      buffer = await this.s3.getObjectBuffer(doc.reportPdfS3Key);
    } else {
      // Missing, or rendered by an older template — render once now (so the
      // viewer gets current wording immediately) and store a fresh copy.
      const [payment, owner] = await Promise.all([
        this.svc.paymentInfo(doc),
        this.users.findById(doc.userId),
      ]);
      const subject = await this.resolveReportImages({
        ...doc,
        clientName: owner?.name ?? '',
        amountPaid: payment.amountPaid,
        caseRef: payment.caseRef,
      });
      buffer = await this.pdf.htmlToPdf(renderSubjectReportHtml(subject), {
        printBackground: true,
        footerTemplate: renderReportFooter(subject),
        margin: { top: '10mm', bottom: '18mm', left: '12mm', right: '12mm' },
      });
      this.reportGen.generateNow(doc.id);
    }

    const safeName = (doc.name || 'candidate')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
    const disposition =
      req.query?.download === '1' ? 'attachment' : 'inline';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="assurio-report-${safeName}.pdf"`,
    );
    // The report is regenerated on every status update — never let the browser
    // serve a stale/ETag-revalidated (304) copy of an old render.
    res.setHeader('Cache-Control', 'no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.send(buffer);
  }

  private requireOwner(req: RequestWithUser): string {
    if (req.user?.role === 'candidate') {
      throw new ForbiddenException('Account holder access required');
    }
    const userId = req.user?.sub;
    if (!userId) throw new BadRequestException('Missing user');
    return userId;
  }
}
