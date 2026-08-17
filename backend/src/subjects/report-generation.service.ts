import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../common/prisma.service';
import { S3Service } from '../common/s3.service';
import { PdfService } from '../common/pdf.service';
import { EventsService } from '../common/events.service';
import {
  renderReportFooter,
  renderSubjectReportHtml,
} from './subject-report-html';
import { resolveReportImages } from './report-images';

export const REPORT_QUEUE = 'report-generation';
export const REPORT_JOB = 'regenerate';
/**
 * Bump whenever the report template changes. It's baked into the S3 key, so
 * PDFs rendered by an older template read as stale and get re-rendered on the
 * next view instead of silently serving outdated wording forever.
 */
// v5: "Verified manually" status + legend, Date Completed now counts terminal
// outcomes (manual / failed), and vendor-supplied credit & court report PDFs are
// attached as documents.
export const REPORT_TEMPLATE_VERSION = 5;

/** True when a stored report predates the current template. */
export function isReportStale(key: string | null | undefined): boolean {
  return !key || !key.includes(`/v${REPORT_TEMPLATE_VERSION}/`);
}
/** Debounce window — coalesces a burst of status updates into one render. */
export const REPORT_DEBOUNCE_MS = 20_000;
const jobIdFor = (subjectId: string) => `report-${subjectId}`;

/**
 * Keeps a subject's BGV report PDF fresh on S3. Every status/data update calls
 * `scheduleRegen`, which (re)schedules a single delayed job per subject — so a
 * flurry of vendor responses collapses into one render ~20s after the last
 * change. The job renders the report server-side, uploads it to S3, points the
 * subject at the new object, and deletes the previous one. Preview/download
 * then stream this stored PDF instead of rendering on the fly.
 */
@Injectable()
export class ReportGenerationService {
  private readonly logger = new Logger(ReportGenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly pdf: PdfService,
    private readonly events: EventsService,
    @InjectQueue(REPORT_QUEUE) private readonly queue: Queue,
  ) {}

  /** Debounced, fire-and-forget: (re)schedule the regen job for this subject. */
  scheduleRegen(subjectId: string): void {
    this.enqueue(subjectId, REPORT_DEBOUNCE_MS);
  }

  /**
   * Undebounced: render the report right now. Used the moment a subject is
   * created (payment captured) so the client has a report from the start —
   * showing every check as awaiting the candidate's consent — instead of the
   * first viewer paying for a live render. Later vendor results come in
   * through the debounced path and replace this object.
   */
  generateNow(subjectId: string): void {
    this.enqueue(subjectId, 0);
  }

  /** One job per subject; re-adding pushes the fire time out to now + delay. */
  private enqueue(subjectId: string, delay: number): void {
    if (!subjectId) return;
    void (async () => {
      const jobId = jobIdFor(subjectId);
      const existing = await this.queue.getJob(jobId);
      if (existing) {
        await existing.remove().catch(() => {});
      }
      await this.queue.add(
        REPORT_JOB,
        { subjectId },
        {
          jobId,
          delay,
          removeOnComplete: true,
          removeOnFail: 50,
        },
      );
    })().catch((err: unknown) =>
      this.logger.warn(
        `Failed to schedule report regen for ${subjectId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      ),
    );
  }

  /** Render the report, store it on S3, and retire the previous object. */
  async regenerate(subjectId: string): Promise<void> {
    if (!this.s3.isConfigured) {
      this.logger.warn('S3 not configured — skipping report generation');
      return;
    }
    const doc = await this.prisma.subject.findUnique({ where: { id: subjectId } });
    if (!doc) return;

    const owner = await this.prisma.user.findUnique({ where: { id: doc.userId } });
    const invoice = doc.email
      ? await this.prisma.invoice.findFirst({
          where: { userId: doc.userId, customerEmail: doc.email, status: 'paid' },
          orderBy: { paidAt: 'desc' },
        })
      : null;

    const subject = await resolveReportImages(this.s3, {
      ...doc,
      clientName: owner?.name ?? '',
      amountPaid: invoice ? Number(invoice.total) : null,
      caseRef:
        invoice?.invoiceNumber || 'VER-' + doc.id.slice(-6).toUpperCase(),
    });

    const buffer = await this.pdf.htmlToPdf(renderSubjectReportHtml(subject), {
      printBackground: true,
      footerTemplate: renderReportFooter(subject),
      margin: { top: '10mm', bottom: '18mm', left: '12mm', right: '12mm' },
    });

    const newKey = `reports/${doc.id}/v${REPORT_TEMPLATE_VERSION}/${randomUUID()}.pdf`;
    await this.s3.upload(newKey, buffer, 'application/pdf');

    const previousKey = doc.reportPdfS3Key;
    await this.prisma.subject.update({
      where: { id: doc.id },
      data: { reportPdfS3Key: newKey, reportPdfGeneratedAt: new Date() },
    });

    // Retire the old object once the new one is committed.
    if (previousKey && previousKey !== newKey) {
      await this.s3.delete(previousKey).catch((err: unknown) =>
        this.logger.warn(
          `Failed to delete previous report ${previousKey}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );
    }

    // Nudge any open viewer to reload the fresh PDF.
    this.events.emit(this.events.subjectChannel(doc.id), {
      reportUpdatedAt: new Date().toISOString(),
    });
    this.logger.log(`Report regenerated for ${doc.id} → ${newKey}`);
  }
}
