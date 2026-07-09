import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import Razorpay from 'razorpay';
import { PrismaService } from '../common/prisma.service';
import { Invoice } from '../../generated/prisma/client';

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  rate: number;
  total: number;
}

interface CreateLinkInput {
  amount: number; // in rupees
  description: string;
  customer: { name: string; email: string; contact?: string };
  notes?: Record<string, string>;
  callbackUrl: string;
  referenceId?: string;
}

export interface PaymentLink {
  id: string;
  short_url: string;
  status: string;
  amount: number;
  reference_id?: string;
}

interface PaymentLinkFetched {
  id: string;
  short_url: string;
  status: string;
  amount: number;
  currency: string;
  reference_id?: string;
  description?: string;
  customer?: { name?: string; email?: string; contact?: string };
  notes?: Record<string, string>;
  payments?: Array<{ payment_id?: string; status?: string }>;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private client: Razorpay | null = null;

  constructor(private readonly prisma: PrismaService) {
    const key_id = process.env.RAZORPAY_KEY_ID;
    const key_secret = process.env.RAZORPAY_KEY_SECRET;
    if (!key_id || !key_secret) {
      this.logger.warn(
        'RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not configured — payments will fail.',
      );
      return;
    }
    this.client = new Razorpay({ key_id, key_secret });
  }

  private requireClient(): Razorpay {
    if (!this.client) {
      throw new BadRequestException(
        'Payments are not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET on the server.',
      );
    }
    return this.client;
  }

  async createLink(input: CreateLinkInput): Promise<PaymentLink> {
    const rzp = this.requireClient();
    const currency = process.env.RAZORPAY_CURRENCY || 'INR';
    const link = await rzp.paymentLink.create({
      amount: Math.round(input.amount * 100),
      currency,
      accept_partial: false,
      description: input.description,
      customer: {
        name: input.customer.name,
        email: input.customer.email,
        contact: input.customer.contact,
      },
      notify: { sms: false, email: false },
      reminder_enable: false,
      notes: input.notes,
      callback_url: input.callbackUrl,
      callback_method: 'get',
      reference_id: input.referenceId,
    });
    return {
      id: link.id,
      short_url: link.short_url,
      status: link.status,
      amount: Number(link.amount),
      reference_id:
        typeof link.reference_id === 'string' ? link.reference_id : undefined,
    };
  }

  verifyLinkCallback(params: {
    razorpay_payment_id: string;
    razorpay_payment_link_id: string;
    razorpay_payment_link_reference_id: string;
    razorpay_payment_link_status: string;
    razorpay_signature: string;
  }): boolean {
    const key_secret = process.env.RAZORPAY_KEY_SECRET;
    if (!key_secret) return false;
    const body = [
      params.razorpay_payment_link_id,
      params.razorpay_payment_link_reference_id ?? '',
      params.razorpay_payment_link_status,
      params.razorpay_payment_id,
    ].join('|');
    const expected = crypto
      .createHmac('sha256', key_secret)
      .update(body)
      .digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(params.razorpay_signature),
    );
  }

  async fetchPaymentLink(linkId: string): Promise<PaymentLinkFetched> {
    const rzp = this.requireClient();
    return (await rzp.paymentLink.fetch(linkId)) as unknown as PaymentLinkFetched;
  }

  async createOrGetInvoiceFromPayment(args: {
    userId: string;
    razorpayPaymentId: string;
    razorpayPaymentLinkId: string;
    razorpayPaymentLinkReferenceId?: string;
  }): Promise<Invoice> {
    const existing = await this.prisma.invoice.findUnique({
      where: { razorpayPaymentId: args.razorpayPaymentId },
    });
    if (existing) return existing;

    const link = await this.fetchPaymentLink(args.razorpayPaymentLinkId);
    const totalRupees = Math.round(Number(link.amount)) / 100;
    const taxRate = 18;
    const subtotal = Math.round((totalRupees / (1 + taxRate / 100)) * 100) / 100;
    const tax = Math.round((totalRupees - subtotal) * 100) / 100;

    const description = link.description || 'Assurio background verification bundle';
    const lineItems: InvoiceLineItem[] = [
      { description, quantity: 1, rate: subtotal, total: subtotal },
    ];

    const invoiceNumber = await this.nextInvoiceNumber();

    try {
      return await this.prisma.invoice.create({
        data: {
          invoiceNumber,
          userId: args.userId,
          customerName: link.customer?.name?.trim() || 'Customer',
          customerEmail: link.customer?.email?.trim() || '',
          customerPhone: link.customer?.contact?.trim() || undefined,
          lineItems: lineItems as any,
          subtotal,
          tax,
          total: totalRupees,
          taxRatePercent: taxRate,
          currency: link.currency || 'INR',
          status: 'paid',
          razorpayPaymentId: args.razorpayPaymentId,
          razorpayPaymentLinkId: args.razorpayPaymentLinkId,
          razorpayPaymentLinkReferenceId: args.razorpayPaymentLinkReferenceId,
          paidAt: new Date(),
          notes: link.notes,
        },
      });
    } catch (err) {
      const again = await this.prisma.invoice.findUnique({
        where: { razorpayPaymentId: args.razorpayPaymentId },
      });
      if (again) return again;
      throw err;
    }
  }

  async updatePdfS3Key(invoiceId: string, key: string): Promise<void> {
    await this.prisma.invoice.update({ where: { id: invoiceId }, data: { pdfS3Key: key } });
  }

  findInvoiceById(id: string): Promise<Invoice | null> {
    return this.prisma.invoice.findUnique({ where: { id } });
  }

  listInvoicesForUser(userId: string): Promise<Invoice[]> {
    return this.prisma.invoice.findMany({
      where: { userId },
      orderBy: { paidAt: 'desc' },
    });
  }

  findLatestInvoice(): Promise<Invoice | null> {
    return this.prisma.invoice.findFirst({ orderBy: { paidAt: 'desc' } });
  }

  private async nextInvoiceNumber(): Promise<string> {
    const now = new Date();
    const yyyymm =
      now.getFullYear().toString() +
      (now.getMonth() + 1).toString().padStart(2, '0');
    const prefix = `ASR-${yyyymm}-`;
    const last = await this.prisma.invoice.findFirst({
      where: { invoiceNumber: { startsWith: prefix } },
      orderBy: { invoiceNumber: 'desc' },
    });
    let n = 1;
    if (last) {
      const tail = last.invoiceNumber.split('-').pop() || '0';
      n = parseInt(tail, 10) + 1;
    }
    return prefix + n.toString().padStart(6, '0');
  }

  renderInvoiceHtml(inv: Invoice): string {
    const lineItems = (inv.lineItems ?? []) as unknown as InvoiceLineItem[];
    const fmtAmt = (n: number) =>
      '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2 });
    const fmtDate = (d: Date | undefined | null) =>
      d
        ? new Date(d).toLocaleString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: true,
          })
        : '—';

    const rows = lineItems.map((li, i) => `
      <tr class="${i % 2 === 1 ? 'alt' : ''}">
        <td class="desc">${escapeHtml(li.description)}</td>
        <td class="num">${li.quantity}</td>
        <td class="num">${fmtAmt(li.rate)}</td>
        <td class="num bold">${fmtAmt(li.total)}</td>
      </tr>`).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Invoice ${escapeHtml(inv.invoiceNumber)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  html,body{background:#f3ecdc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a1612;-webkit-font-smoothing:antialiased;}
  body{padding:32px 16px;}
  .page{max-width:680px;margin:0 auto;background:#fbf6e9;border:1px solid #e0d4bb;border-radius:18px;overflow:hidden;box-shadow:0 2px 24px rgba(26,22,18,0.08);}
  .header{background:#1a1612;padding:36px 40px 32px;display:flex;justify-content:space-between;align-items:flex-start;}
  .logo-row{display:flex;align-items:center;gap:13px;}
  .logo-mark{width:42px;height:42px;background:#f3ecdc;border-radius:10px;display:flex;align-items:center;justify-content:center;font-family:'Times New Roman',Georgia,serif;font-size:22px;font-weight:500;color:#1a1612;flex-shrink:0;}
  .logo-name{font-family:'Times New Roman',Georgia,serif;font-size:22px;font-weight:500;color:#f3ecdc;letter-spacing:-0.01em;}
  .logo-tagline{font-size:11px;color:#6b6157;margin-top:2px;letter-spacing:0.04em;}
  .header-right{text-align:right;}
  .inv-label{font-size:10px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:#6b6157;margin-bottom:4px;}
  .inv-number{font-family:'Times New Roman',Georgia,serif;font-size:22px;font-weight:500;color:#f3ecdc;letter-spacing:-0.01em;}
  .badge{display:inline-block;margin-top:8px;background:#2f6649;color:#e7ecda;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;padding:4px 12px;border-radius:99px;border:1px solid #2f664966;}
  .body{padding:36px 40px;}
  .meta{display:grid;grid-template-columns:1fr 1fr;gap:24px;padding-bottom:28px;border-bottom:1px solid #e0d4bb;margin-bottom:28px;}
  .meta-label{font-size:10px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#948776;margin-bottom:6px;}
  .meta-value{font-family:'Times New Roman',Georgia,serif;font-size:15px;font-weight:500;color:#1a1612;line-height:1.45;}
  .meta-sub{font-size:12px;color:#6b6157;margin-top:3px;}
  .meta-right{text-align:right;}
  table{width:100%;border-collapse:collapse;margin-bottom:0;}
  thead tr{border-bottom:2px solid #1a1612;}
  th{font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#948776;padding:0 0 10px;text-align:left;}
  th.num{text-align:right;}
  tbody tr{border-bottom:1px solid #e0d4bb;}
  tbody tr.alt{background:#f3ecdc55;}
  td{padding:13px 0;font-size:13.5px;color:#1a1612;vertical-align:top;}
  td.desc{font-weight:500;padding-right:16px;}
  td.num{text-align:right;color:#6b6157;}
  td.bold{font-weight:700;color:#1a1612;}
  .totals{margin-top:20px;padding-top:16px;border-top:1px solid #e0d4bb;}
  .totals-row{display:flex;justify-content:space-between;font-size:13px;color:#6b6157;padding:4px 0;}
  .totals-row.grand{margin-top:12px;padding-top:14px;border-top:2px solid #1a1612;font-size:18px;font-weight:700;color:#1a1612;}
  .pay-strip{background:#f3ecdc;border:1px solid #e0d4bb;border-radius:10px;padding:18px 20px;margin-top:28px;display:grid;grid-template-columns:1fr 1fr;}
  .pay-label{font-size:10px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#948776;margin-bottom:5px;}
  .pay-value{font-size:13px;font-weight:600;color:#1a1612;word-break:break-all;}
  .pay-right{text-align:right;}
  .footer{margin-top:32px;padding-top:20px;border-top:1px solid #e0d4bb;display:flex;justify-content:space-between;align-items:center;}
  .footer-left{font-size:11px;color:#948776;line-height:1.7;}
  .footer-stamp{font-size:11.5px;color:#2f6649;font-weight:600;letter-spacing:0.04em;}
  @media print{*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}html,body{background:#f3ecdc!important;padding:0!important;}.page{box-shadow:none!important;border-radius:0!important;}}
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <div class="logo-row">
        <div class="logo-mark">A</div>
        <div>
          <div class="logo-name">Assurio</div>
          <div class="logo-tagline">assurio.com · Consent-first background checks</div>
        </div>
      </div>
    </div>
    <div class="header-right">
      <div class="inv-label">Tax Invoice</div>
      <div class="inv-number">${escapeHtml(inv.invoiceNumber)}</div>
      <span class="badge">PAID</span>
    </div>
  </div>
  <div class="body">
    <div class="meta">
      <div>
        <div class="meta-label">Billed to</div>
        <div class="meta-value">${escapeHtml(inv.customerName)}</div>
        <div class="meta-sub">${escapeHtml(inv.customerEmail || '')}</div>
        ${inv.customerPhone ? `<div class="meta-sub">${escapeHtml(inv.customerPhone)}</div>` : ''}
      </div>
      <div class="meta-right">
        <div class="meta-label">Invoice date</div>
        <div class="meta-value">${fmtDate(inv.paidAt)}</div>
        <div class="meta-sub">Payment ID: ${escapeHtml(inv.razorpayPaymentId)}</div>
      </div>
    </div>
    <table>
      <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="totals">
      <div class="totals-row"><span>Subtotal</span><span>${fmtAmt(inv.subtotal)}</span></div>
      <div class="totals-row"><span>GST (${inv.taxRatePercent}%)</span><span>${fmtAmt(inv.tax)}</span></div>
      <div class="totals-row grand"><span>Total Paid</span><span>${fmtAmt(inv.total)}</span></div>
    </div>
    <div class="pay-strip">
      <div><div class="pay-label">Payment method</div><div class="pay-value">Razorpay</div></div>
      <div class="pay-right"><div class="pay-label">Link ID</div><div class="pay-value">${escapeHtml(inv.razorpayPaymentLinkId || '—')}</div></div>
    </div>
    <div class="footer">
      <div class="footer-left">Assurio · assurio.com<br/>Computer-generated receipt · No signature required</div>
      <div class="footer-stamp">✓ Verified</div>
    </div>
  </div>
</div>
</body>
</html>`;
  }
}

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
