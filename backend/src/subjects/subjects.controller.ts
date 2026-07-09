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
import { WhatsAppService } from '../common/whatsapp.service';
import { EventsService } from '../common/events.service';
import { toSubjectResponse } from './subject-response';
import { SubjectPatch, SubjectsService } from './subjects.service';
import { UsersService } from '../users/users.service';

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
    private readonly whatsapp: WhatsAppService,
    private readonly users: UsersService,
    private readonly events: EventsService,
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
    },
  ) {
    const userId = this.requireOwner(req);
    const name = (body.name || '').trim();
    const email = (body.email || '').trim();
    if (!name) throw new BadRequestException('Name is required');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('A valid email is required');
    }

    const doc = await this.svc.create(userId, {
      name,
      role: body.role,
      email,
      phone: body.phone,
      panNumber: body.panNumber,
      aadhaarNumber: body.aadhaarNumber,
    });

    const response = toSubjectResponse(doc);
    const inviteUrl = response.inviteUrl as string;

    // 1. Send invite email to candidate
    const emailSent = await this.email.sendInvite(doc.email, doc.name, inviteUrl);

    // Look up the owner so we can include their name in the candidate's message.
    const ownerUser = await this.users.findById(userId).catch(() => null);
    const clientName = ownerUser?.name || 'Assurio';

    // 2. Send CANDIDATE a "verification started by [client]" WhatsApp message.
    if (doc.phone) {
      this.whatsapp
        .sendVerificationStarted(doc.phone, doc.name, clientName, inviteUrl, doc.role)
        .catch((err: unknown) =>
          this.logger.error('WhatsApp verification-started to candidate failed', err),
        );
    }
    // Client gets the invoice PDF via payments verify() — no extra notification here.

    return { ...response, emailSent };
  }

  @Get(':id')
  async getOne(@Req() req: RequestWithUser, @Param('id') id: string) {
    const userId = this.requireOwner(req);
    const doc = await this.svc.findOwned(userId, id);
    return toSubjectResponse(doc);
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

    // Fire-and-forget candidate notifications (email + WhatsApp).
    for (const label of newChecks) {
      if (doc.email) {
        this.email.sendCheckStarted(doc.email, doc.name, label)
          .catch((err: unknown) => this.logger.error(`Email check-started (${label}) failed`, err));
      }
      if (doc.phone) {
        this.whatsapp.sendCheckStarted(doc.phone, doc.name, label)
          .catch((err: unknown) => this.logger.error(`WhatsApp check-started (${label}) failed`, err));
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

  private requireOwner(req: RequestWithUser): string {
    if (req.user?.role === 'candidate') {
      throw new ForbiddenException('Account holder access required');
    }
    const userId = req.user?.sub;
    if (!userId) throw new BadRequestException('Missing user');
    return userId;
  }
}
