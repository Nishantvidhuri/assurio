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
import { S3Service } from '../common/s3.service';
import { PdfService } from '../common/pdf.service';
import { renderTaxInvoiceHtml } from './tax-invoice-html';
import { InvoicePdfService } from './invoice-pdf.service';

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

interface CreateOrderBody {
  amount?: number;
  description?: string;
  customer?: { name?: string; email?: string; contact?: string };
  notes?: Record<string, string>;
  receipt?: string;
}

interface VerifyBody {
  // Embedded-checkout (Order) flow.
  razorpay_order_id?: string;
  // Hosted payment-link flow.
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
    razorpayOrderId: inv.razorpayOrderId,
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
    private readonly s3: S3Service,
    private readonly pdf: PdfService,
    private readonly invoicePdf: InvoicePdfService,
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
  @Post('order')
  async createOrder(@Req() req: RequestWithUser, @Body() body: CreateOrderBody) {
    if (!req.user?.sub) throw new BadRequestException('Not authenticated');

    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('amount must be a positive number');
    }
    const name = (body.customer?.name || '').trim();
    if (!name) throw new BadRequestException('customer.name is required');
    const email = (body.customer?.email || '').trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('customer.email is invalid');
    }

    // Customer + description ride along in notes so the invoice can be rebuilt
    // from the fetched order at verify time (orders don't store a customer).
    const notes: Record<string, string> = {
      ...(body.notes || {}),
      customer_name: name,
      customer_email: email,
      customer_contact: (body.customer?.contact || '').trim(),
      description: (body.description || 'Assurio verification').slice(0, 512),
    };

    const order = await this.payments.createOrder({
      amount,
      notes,
      receipt: body.receipt,
    });

    return {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: this.payments.publicKeyId,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('verify')
  async verify(@Req() req: RequestWithUser, @Body() body: VerifyBody) {
    const userId = req.user?.sub;
    if (!userId) throw new BadRequestException('Not authenticated');

    // Embedded-checkout (Order) flow.
    if (body.razorpay_order_id) {
      if (!body.razorpay_payment_id || !body.razorpay_signature) {
        throw new BadRequestException('Missing Razorpay callback parameters');
      }
      const ok = this.payments.verifyOrderSignature({
        order_id: body.razorpay_order_id,
        payment_id: body.razorpay_payment_id,
        signature: body.razorpay_signature,
      });
      if (!ok) return { verified: false };
      try {
        const inv = await this.payments.createOrGetInvoiceFromOrder({
          userId,
          razorpayOrderId: body.razorpay_order_id,
          razorpayPaymentId: body.razorpay_payment_id,
        });
        return { verified: true, invoice: toInvoiceResponse(inv) };
      } catch (err) {
        return {
          verified: true,
          invoice: null,
          invoiceError:
            err instanceof Error ? err.message : 'Failed to create invoice',
        };
      }
    }

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
    const [pdfUrl, buyer] = await Promise.all([
      inv.pdfS3Key && this.s3.isConfigured
        ? this.s3.presignedUrl(inv.pdfS3Key).catch(() => null)
        : Promise.resolve(null),
      this.payments.billingClient(inv.userId),
    ]);
    // buyer = the client (account holder) → "Billed To"; the stored customer* is
    // the candidate that was verified → the line item.
    return { ...toInvoiceResponse(inv, pdfUrl), buyer };
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
   * Tax Invoice — serves the PDF generated and stored on S3 at payment time:
   * inline for preview, as an attachment with ?download=1.
   *
   * Falls back to rendering on the fly only when the stored object isn't there
   * yet (job still in flight, or S3 unconfigured in dev) and re-queues it, so a
   * receipt is never unavailable to the client.
   */
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
    const asDownload =
      req.query?.download === '1' || req.query?.print === '1';

    const sendPdf = (buffer: Buffer) => {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `${asDownload ? 'attachment' : 'inline'}; filename="${inv.invoiceNumber}.pdf"`,
      );
      res.send(buffer);
    };

    // Stored receipt — the normal path once the payment-time job has run.
    if (inv.pdfS3Key && this.s3.isConfigured) {
      try {
        sendPdf(await this.s3.getObjectBuffer(inv.pdfS3Key));
        return;
      } catch (err) {
        this.logger.warn(
          `Stored invoice PDF unreadable (${inv.pdfS3Key}) — re-rendering: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    // Fallback: render now and make sure the stored copy gets created.
    this.invoicePdf.enqueue(inv.id);
    // Billed To = the client (account holder), not the candidate stored in the
    // invoice's customer* fields (which becomes the line item).
    const buyer = await this.payments.billingClient(inv.userId);
    const html = renderTaxInvoiceHtml(inv, buyer ?? undefined);
    // 600px-wide document, height trimmed to content — matches Recriauth's
    // fixed-size invoice PDF (no A4 side margins or bottom gap).
    sendPdf(
      await this.pdf.htmlToPdf(html, {
        printBackground: true,
        pageWidthPx: 600,
        fitHeight: true,
      }),
    );
  }
}
