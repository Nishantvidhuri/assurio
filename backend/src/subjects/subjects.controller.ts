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
import { SubjectPatch, SubjectsService } from './subjects.service';
import { SubjectVerificationService } from './subject-verification.service';
import { UsersService } from '../users/users.service';
import { PdfService } from '../common/pdf.service';

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
  ) {}

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

    const doc = await this.svc.create(userId, {
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
    });

    // Paid → auto-run every check the data supports (PAN now, crime if DOB…).
    // Fire-and-forget: the response never waits on a vendor call.
    this.subjectVerification.runForSubject(doc.id);

    const response = toSubjectResponse(doc);
    const inviteUrl = response.inviteUrl as string;

    // Only email the invite link when we actually have an address.
    const emailSent = doc.email
      ? await this.email.sendInvite(doc.email, doc.name, inviteUrl)
      : false;

    return { ...response, emailSent };
  }

  @Get(':id')
  async getOne(@Req() req: RequestWithUser, @Param('id') id: string) {
    const userId = this.requireOwner(req);
    const doc = await this.svc.findOwned(userId, id);
    const payment = await this.svc.paymentInfo(doc);
    return { ...toSubjectResponse(doc), ...payment };
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
    await this.svc.remove(userId, id);
    return { ok: true };
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

    const [payment, owner] = await Promise.all([
      this.svc.paymentInfo(doc),
      this.users.findById(doc.userId),
    ]);

    const subject = {
      ...doc,
      clientName: owner?.name ?? '',
      amountPaid: payment.amountPaid,
      caseRef: payment.caseRef,
    };
    const buffer = await this.pdf.htmlToPdf(renderSubjectReportHtml(subject), {
      printBackground: true,
      footerTemplate: renderReportFooter(subject),
      margin: { top: '10mm', bottom: '18mm', left: '12mm', right: '12mm' },
    });

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
