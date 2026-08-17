import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  REPORT_JOB,
  REPORT_QUEUE,
  ReportGenerationService,
} from './report-generation.service';

/**
 * In-process worker that renders + uploads a subject's report PDF. Concurrency
 * 1 — PDF rendering (headless Chromium) is heavy and the job is debounced, so
 * one at a time is plenty.
 */
@Processor(REPORT_QUEUE, { concurrency: 1 })
export class ReportGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(ReportGenerationProcessor.name);

  constructor(private readonly reports: ReportGenerationService) {
    super();
  }

  async process(job: Job<{ subjectId?: string }>): Promise<void> {
    if (job.name !== REPORT_JOB) {
      this.logger.warn(`Ignoring unsupported report job ${job.name}`);
      return;
    }
    const subjectId = job.data?.subjectId;
    if (!subjectId) {
      throw new Error('report job is missing subjectId');
    }
    await this.reports.regenerate(subjectId);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<{ subjectId?: string }>, error: Error): void {
    this.logger.error(
      `Report generation failed for ${job.data?.subjectId}: ${error?.message}`,
    );
  }
}
