import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../common/prisma.service';
import { S3Service } from '../common/s3.service';
import { PdfService } from '../common/pdf.service';
import { renderTaxInvoiceHtml } from './tax-invoice-html';

export const INVOICE_PDF_QUEUE = 'invoice-pdf';
export const INVOICE_PDF_JOB = 'generate';

/**
 * Generates the tax-invoice PDF the moment a payment is verified and stores it
 * on S3, so preview/download stream a stable receipt instead of re-rendering
 * through headless Chrome on every click.
 *
 * A paid invoice never changes, so generation is one-shot and idempotent: the
 * job is keyed by invoice id (a retry or a duplicate verify can't produce two
 * objects) and returns early once `pdfS3Key` is set. Work runs on BullMQ so a
 * crash mid-render resumes instead of silently losing the receipt; the print
 * endpoint still renders on the fly as a fallback while the job is in flight.
 */
@Injectable()
export class InvoicePdfService {
  private readonly logger = new Logger(InvoicePdfService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly pdf: PdfService,
    @InjectQueue(INVOICE_PDF_QUEUE) private readonly queue: Queue,
  ) {}

  /** Fire-and-forget: queue PDF generation for a freshly paid invoice. */
  enqueue(invoiceId: string): void {
    if (!invoiceId) return;
    void this.queue
      .add(
        INVOICE_PDF_JOB,
        { invoiceId },
        {
          // One job per invoice — replaying the same payment can't double-render.
          jobId: `invoice-${invoiceId}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: true,
          removeOnFail: 50,
        },
      )
      .catch((err: unknown) =>
        this.logger.warn(
          `Failed to queue invoice PDF for ${invoiceId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );
  }

  /** Render → upload → store the key. No-op if it already exists. */
  async generate(invoiceId: string): Promise<string | null> {
    if (!this.s3.isConfigured) {
      this.logger.warn('S3 not configured — skipping invoice PDF generation');
      return null;
    }
    const inv = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });
    if (!inv) return null;
    if (inv.pdfS3Key) return inv.pdfS3Key;

    const buyer = await this.prisma.user.findUnique({
      where: { id: inv.userId },
    });
    const html = renderTaxInvoiceHtml(
      inv,
      buyer
        ? { name: buyer.name, email: buyer.email, phone: buyer.phone ?? null }
        : undefined,
    );
    // Same 600px-wide, height-to-content page the print endpoint produces.
    const buffer = await this.pdf.htmlToPdf(html, {
      printBackground: true,
      pageWidthPx: 600,
      fitHeight: true,
    });

    const key = `invoices/${inv.userId}/${inv.invoiceNumber}.pdf`;
    await this.s3.upload(key, buffer, 'application/pdf');
    await this.prisma.invoice.update({
      where: { id: inv.id },
      data: { pdfS3Key: key },
    });
    this.logger.log(`Invoice PDF stored for ${inv.invoiceNumber} → ${key}`);
    return key;
  }
}
