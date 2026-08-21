import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SubjectsService } from '../subjects/subjects.service';
import { AdminService } from './admin.service';
import { AdminWalletCreditDto } from './admin-wallet-credit.dto';
import { WalletService } from '../wallet/wallet.service';
import { adminCreditKey, paiseToRupees } from '../wallet/wallet.constants';
import { randomUUID } from 'crypto';
import {
  InvoiceLifecycleService,
  type ListFilters,
} from '../payments/invoice-lifecycle.service';

interface RequestWithUser extends Request {
  user?: { sub?: string; role?: string };
}

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly subjectsSvc: SubjectsService,
    private readonly invoiceLifecycle: InvoiceLifecycleService,
    private readonly wallet: WalletService,
  ) {}

  /**
   * Credit a client's wallet by hand — money received outside Razorpay, a
   * goodwill credit, a correction.
   *
   * Goes through the same ledger as every other movement rather than touching
   * the balance directly: the entry is immutable, attributed to the admin who
   * made it, carries their stated reason, and is keyed so a resubmit cannot
   * double-credit. `applied: false` means the key had already been used and
   * nothing changed — the caller can tell a duplicate from a fresh credit.
   */
  @Post('clients/:id/wallet/credit')
  async creditClientWallet(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() body: AdminWalletCreditDto,
  ) {
    this.requireAdmin(req);
    const client = await this.admin.findClientUser(id);
    if (!client) throw new NotFoundException('Client not found');
    if (client.role === 'admin') {
      throw new BadRequestException('Admins do not hold a client wallet');
    }

    const note = body.note.trim();
    if (!note) {
      throw new BadRequestException('A reason is required for a manual credit');
    }

    const result = await this.wallet.credit({
      userId: id,
      reason: 'ADMIN_CREDIT',
      amountPaise: body.amountPaise,
      idempotencyKey: adminCreditKey(body.requestId || randomUUID()),
      note,
      createdByUserId: req.user?.sub,
    });

    return {
      applied: result.applied,
      balancePaise: result.balancePaise,
      balanceRupees: paiseToRupees(result.balancePaise),
    };
  }

  // ── Internal per-client invoices ledger (read-only) ──
  // Our billing is pay-first: the client pays (Razorpay) and the invoice is
  // generated instantly. So this is a per-client ledger of those paid invoices
  // — no operator create / mark-paid / void lifecycle.

  @Get('clients/:id/invoices')
  clientInvoices(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Query() q: Record<string, string>,
  ) {
    this.requireAdmin(req);
    const filters: ListFilters = {
      businessStatus: q.businessStatus as ListFilters['businessStatus'],
      search: q.search,
      minAmount: q.minAmount ? Number(q.minAmount) : undefined,
      maxAmount: q.maxAmount ? Number(q.maxAmount) : undefined,
      page: q.page ? Number(q.page) : undefined,
      pageSize: q.pageSize ? Number(q.pageSize) : undefined,
    };
    return this.invoiceLifecycle.listForClient(id, filters);
  }

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

  @Get('drafts/:id')
  draft(@Req() req: RequestWithUser, @Param('id') id: string) {
    this.requireAdmin(req);
    return this.admin.getDraft(id);
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

    const doc = await this.subjectsSvc.patchAny(id, patch);

    return this.admin.getSubject(doc.id);
  }

  private requireAdmin(req: RequestWithUser): void {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }
  }
}
