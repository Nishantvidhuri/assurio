import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaymentsService } from './payments.service';
import { Invoice } from '../../generated/prisma/client';
import { WhatsAppService } from '../common/whatsapp.service';
import { PdfService } from '../common/pdf.service';
import { S3Service } from '../common/s3.service';
import { UsersService } from '../users/users.service';
import { OutboxService } from '../outbox/outbox.service';

interface RequestWithUser extends Request {
  user?: { sub?: string; role?: string; email?: string };
}

interface CreateLinkBody {
  amount?: number;
  description?: string;
  customer?: { name?: string; email?: string; contact?: string };
  notes?: Record<string, string>;
  callbackPath?: string;
  referenceId?: string;
}

interface VerifyBody {
  razorpay_payment_id?: string;
  razorpay_payment_link_id?: string;
  razorpay_payment_link_reference_id?: string;
  razorpay_payment_link_status?: string;
  razorpay_signature?: string;
}

function toInvoiceResponse(inv: Invoice, pdfUrl?: string | null) {
  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    status: inv.status,
    customer: {
      name: inv.customerName,
      email: inv.customerEmail,
      phone: inv.customerPhone,
    },
    lineItems: inv.lineItems,
    subtotal: inv.subtotal,
    tax: inv.tax,
    total: inv.total,
    taxRatePercent: inv.taxRatePercent,
    currency: inv.currency,
    razorpayPaymentId: inv.razorpayPaymentId,
    razorpayPaymentLinkId: inv.razorpayPaymentLinkId,
    paidAt: inv.paidAt,
    createdAt: inv.createdAt,
    pdfS3Key: inv.pdfS3Key ?? null,
    pdfUrl: pdfUrl ?? null,
  };
}

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly payments: PaymentsService,
    private readonly whatsapp: WhatsAppService,
    private readonly pdf: PdfService,
    private readonly s3: S3Service,
    private readonly users: UsersService,
    private readonly outbox: OutboxService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post('link')
  async createLink(@Req() req: RequestWithUser, @Body() body: CreateLinkBody) {
    if (!req.user?.sub) throw new BadRequestException('Not authenticated');

    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('amount must be a positive number');
    }
    const name = (body.customer?.name || '').trim();
    const email = (body.customer?.email || '').trim();
    if (!name) throw new BadRequestException('customer.name is required');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('customer.email is invalid');
    }
    const callbackPath = (body.callbackPath || '').trim();
    if (!callbackPath.startsWith('/')) {
      throw new BadRequestException('callbackPath must start with /');
    }

    const base = (process.env.APP_URL || 'http://localhost:3000').replace(
      /\/$/,
      '',
    );
    const callbackUrl = base + callbackPath;

    const link = await this.payments.createLink({
      amount,
      description: (body.description || 'Assurio verification').slice(0, 2048),
      customer: {
        name,
        email,
        contact: body.customer?.contact?.trim() || undefined,
      },
      notes: body.notes,
      callbackUrl,
      referenceId: body.referenceId,
    });

    return link;
  }

  @UseGuards(JwtAuthGuard)
  @Post('verify')
  async verify(@Req() req: RequestWithUser, @Body() body: VerifyBody) {
    const userId = req.user?.sub;
    if (!userId) throw new BadRequestException('Not authenticated');
    if (
      !body.razorpay_payment_id ||
      !body.razorpay_payment_link_id ||
      !body.razorpay_payment_link_status ||
      !body.razorpay_signature
    ) {
      throw new BadRequestException('Missing Razorpay callback parameters');
    }
    const ok = this.payments.verifyLinkCallback({
      razorpay_payment_id: body.razorpay_payment_id,
      razorpay_payment_link_id: body.razorpay_payment_link_id,
      razorpay_payment_link_reference_id:
        body.razorpay_payment_link_reference_id ?? '',
      razorpay_payment_link_status: body.razorpay_payment_link_status,
      razorpay_signature: body.razorpay_signature,
    });

    if (!ok) return { verified: false };

    // Only create the invoice if the payment actually succeeded.
    if (body.razorpay_payment_link_status !== 'paid') {
      return { verified: true, invoice: null };
    }

    try {
      const inv = await this.payments.createOrGetInvoiceFromPayment({
        userId,
        razorpayPaymentId: body.razorpay_payment_id,
        razorpayPaymentLinkId: body.razorpay_payment_link_id,
        razorpayPaymentLinkReferenceId:
          body.razorpay_payment_link_reference_id ?? undefined,
      });

      // Send invoice PDF to the CLIENT (account holder) via WhatsApp.
      // Note: inv.customerPhone is the CANDIDATE's phone (from the form),
      // so we look up the owner user's own phone instead.
      const ownerUser = userId
        ? await this.users.findById(userId).catch(() => null)
        : null;

      if (ownerUser?.phone) {
        const fmtAmt = (n: number) =>
          '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2 });
        const caption =
          `✅ *Payment confirmed — ${inv.invoiceNumber}*\n\n` +
          `Amount: *${fmtAmt(inv.total)}* (incl. GST)\n` +
          `For: ${((inv.lineItems ?? []) as Array<{ description: string }>)[0]?.description || 'background verification'}\n\n` +
          `_Assurio · assurio.com_`;
        await this.outbox.emit(
          'billing.invoice-notification',
          {
            phone: ownerUser.phone,
            pdfHtml: this.payments.renderInvoiceHtml(inv),
            invoiceNumber: inv.invoiceNumber,
            caption,
          },
          { idempotencyKey: `invoice-notification-${inv.razorpayPaymentId}` },
        );
      } else {
        this.logger.warn(
          `Owner ${userId ?? '?'} has no phone — WhatsApp invoice notification skipped`,
        );
      }

      return { verified: true, invoice: toInvoiceResponse(inv) }; // pdfUrl filled in async above
    } catch (err) {
      // Verification succeeded but invoice creation hiccup'd — surface
      // verified=true so the UI can still progress, but flag the error.
      return {
        verified: true,
        invoice: null,
        invoiceError:
          err instanceof Error ? err.message : 'Failed to create invoice',
      };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('invoice/:id')
  async invoice(@Req() req: RequestWithUser, @Param('id') id: string) {
    if (!req.user?.sub) throw new BadRequestException('Not authenticated');
    const inv = await this.payments.findInvoiceById(id);
    if (!inv) throw new NotFoundException('Invoice not found');
    if (inv.userId !== req.user.sub && req.user.role !== 'admin') {
      throw new NotFoundException('Invoice not found');
    }
    const pdfUrl = inv.pdfS3Key && this.s3.isConfigured
      ? await this.s3.presignedUrl(inv.pdfS3Key).catch(() => null)
      : null;
    return toInvoiceResponse(inv, pdfUrl);
  }

  /** Invoices for the currently signed-in user (client view). */
  @UseGuards(JwtAuthGuard)
  @Get('invoices/mine')
  async myInvoices(@Req() req: RequestWithUser) {
    const userId = req.user?.sub;
    if (!userId) throw new BadRequestException('Not authenticated');
    const list = await this.payments.listInvoicesForUser(userId);
    return Promise.all(
      list.map(async (inv) => {
        const pdfUrl = inv.pdfS3Key && this.s3.isConfigured
          ? await this.s3.presignedUrl(inv.pdfS3Key).catch(() => null)
          : null;
        return toInvoiceResponse(inv, pdfUrl);
      }),
    );
  }

  /**
   * Admin: send the most-recent invoice as a PDF to any WhatsApp number.
   * Used by the admin invoices page to demo the invoice design.
   */
  @UseGuards(JwtAuthGuard)
  @Post('admin/demo-invoice')
  async sendDemoInvoice(
    @Req() req: RequestWithUser,
    @Body() body: { phone?: string; invoiceId?: string },
  ) {
    if (req.user?.role !== 'admin') throw new BadRequestException('Admin only');
    const phone = (body.phone || '').replace(/\D/g, '');
    if (phone.length < 10) throw new BadRequestException('Valid phone required');

    // Use a specific invoice or fall back to the most-recent one
    let inv: Invoice | null = null;
    if (body.invoiceId) {
      inv = await this.payments.findInvoiceById(body.invoiceId);
    }
    if (!inv) {
      inv = await this.payments.findLatestInvoice();
    }
    if (!inv) throw new NotFoundException('No invoices found to use as demo');

    const html = this.payments.renderInvoiceHtml(inv);
    const pdfBuffer = await this.pdf.htmlToPdf(html);
    const caption =
      `🧾 *Demo Invoice — ${inv.invoiceNumber}*\n\n` +
      `Amount: *₹${inv.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}* (incl. GST)\n` +
      `Billed to: ${inv.customerName}\n\n` +
      `_Assurio · assurio.com_`;

    const fullPhone = phone.startsWith('91') ? phone : `91${phone}`;
    const sent = await this.whatsapp.sendInvoicePdf(fullPhone, pdfBuffer, inv.invoiceNumber, caption);
    return { ok: sent, invoiceNumber: inv.invoiceNumber };
  }

  /** Print-friendly HTML — opened in a new tab; user can Cmd+P to save as PDF.
   *  Pass ?download=1 to auto-trigger the browser's print dialog on load. */
  @Get('invoice/:id/print')
  async invoicePrint(
    @Param('id') id: string,
    @Res() res: Response,
    @Req() req: Request,
  ) {
    const inv = await this.payments.findInvoiceById(id);
    if (!inv) {
      res.status(404).type('text/plain').send('Invoice not found');
      return;
    }
    let html = this.payments.renderInvoiceHtml(inv);
    const autoPrint =
      req.query?.download === '1' || req.query?.print === '1';
    if (autoPrint) {
      html = html.replace(
        '</body>',
        '<script>window.addEventListener("load",()=>setTimeout(()=>window.print(),250));</script></body>',
      );
    }
    res.type('text/html').send(html);
  }
}
