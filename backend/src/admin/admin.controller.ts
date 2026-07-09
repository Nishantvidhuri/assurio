import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Logger,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SubjectsService } from '../subjects/subjects.service';
import { UsersService } from '../users/users.service';
import { WhatsAppService } from '../common/whatsapp.service';
import { PdfService } from '../common/pdf.service';
import { AdminService } from './admin.service';

interface RequestWithUser extends Request {
  user?: { sub?: string; role?: string };
}

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(
    private readonly admin: AdminService,
    private readonly subjectsSvc: SubjectsService,
    private readonly users: UsersService,
    private readonly whatsapp: WhatsAppService,
    private readonly pdf: PdfService,
  ) {}

  @Get('overview')
  overview(@Req() req: RequestWithUser) {
    this.requireAdmin(req);
    return this.admin.overview();
  }

  @Get('monthly')
  monthly(@Req() req: RequestWithUser) {
    this.requireAdmin(req);
    return this.admin.monthlyStats();
  }

  @Get('clients')
  clients(@Req() req: RequestWithUser) {
    this.requireAdmin(req);
    return this.admin.listClients();
  }

  @Get('clients/:id')
  client(@Req() req: RequestWithUser, @Param('id') id: string) {
    this.requireAdmin(req);
    return this.admin.getClient(id);
  }

  @Get('subjects')
  subjects(@Req() req: RequestWithUser) {
    this.requireAdmin(req);
    return this.admin.listSubjects();
  }

  @Get('invoices')
  invoices(@Req() req: RequestWithUser) {
    this.requireAdmin(req);
    return this.admin.listInvoices();
  }

  @Get('ops/queues')
  opsQueues(@Req() req: RequestWithUser) {
    this.requireAdmin(req);
    return this.admin.queueHealth();
  }

  @Get('subjects/:id')
  subject(@Req() req: RequestWithUser, @Param('id') id: string) {
    this.requireAdmin(req);
    return this.admin.getSubject(id);
  }

  @Patch('subjects/:id')
  async patchSubject(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    this.requireAdmin(req);
    const allowed = ['crimeRequestId', 'crimeResult', 'status'] as const;
    const patch: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) patch[key] = body[key];
    }

    // Detect if crimeResult is being set for the first time
    const before = await this.subjectsSvc.findById(id).catch(() => null);
    const settingCrimeResult =
      'crimeResult' in patch &&
      patch.crimeResult != null &&
      !before?.crimeResult;

    const doc = await this.subjectsSvc.patchAny(id, patch);

    // Notify the client (owner) when crime check report arrives — send as PDF
    if (settingCrimeResult && doc.crimeResult) {
      const ownerUser = await this.users.findById(doc.userId).catch(() => null);
      if (ownerUser?.phone) {
        const phone = ownerUser.phone;
        const name = doc.name;
        const crimeResult = doc.crimeResult;
        // Fire-and-forget: generate PDF then send
        (async () => {
          try {
            const html = this.whatsapp.renderCrimeReportHtml(name, crimeResult as Record<string, unknown>);
            const pdfBuffer = await this.pdf.htmlToPdf(html);
            await this.whatsapp.sendCrimeReportPdf(phone, pdfBuffer, name);
          } catch (err) {
            this.logger.error('WhatsApp crime report PDF failed', err);
          }
        })();
      } else {
        this.logger.warn(
          `Owner ${doc.userId} has no phone — WhatsApp crime report notification skipped`,
        );
      }
    }

    return this.admin.getSubject(doc.id);
  }

  private requireAdmin(req: RequestWithUser): void {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }
  }
}
