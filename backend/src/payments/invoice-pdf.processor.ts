import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  INVOICE_PDF_JOB,
  INVOICE_PDF_QUEUE,
  InvoicePdfService,
} from './invoice-pdf.service';

/**
 * Renders paid invoices to PDF and stores them on S3. Concurrency 1 — each
 * render spins up a headless-Chrome page, same as the report processor.
 */
@Processor(INVOICE_PDF_QUEUE, { concurrency: 1 })
export class InvoicePdfProcessor extends WorkerHost {
  private readonly logger = new Logger(InvoicePdfProcessor.name);

  constructor(private readonly invoicePdf: InvoicePdfService) {
    super();
  }

  async process(job: Job<{ invoiceId: string }>): Promise<void> {
    if (job.name !== INVOICE_PDF_JOB) return;
    const { invoiceId } = job.data;
    try {
      await this.invoicePdf.generate(invoiceId);
    } catch (err) {
      this.logger.error(
        `Invoice PDF generation failed for ${invoiceId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw err; // let BullMQ retry with backoff
    }
  }
}
