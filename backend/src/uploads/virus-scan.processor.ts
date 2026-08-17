import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { UploadsService } from './uploads.service';
import { UPLOAD_JOBS, UPLOAD_QUEUES } from './uploads.constants';

interface ScanJobData {
  uploadSessionId?: string;
}

/**
 * In-process worker for the `virus-scan` queue. Downloads the object and runs
 * ClamAV (fail-closed). Concurrency 2.
 */
@Processor(UPLOAD_QUEUES.VIRUS_SCAN, { concurrency: 2 })
export class VirusScanProcessor extends WorkerHost {
  private readonly logger = new Logger(VirusScanProcessor.name);

  constructor(private readonly uploads: UploadsService) {
    super();
  }

  async process(job: Job<ScanJobData>): Promise<void> {
    if (job.name !== UPLOAD_JOBS.SCAN) {
      this.logger.warn(`Ignoring unsupported virus-scan job ${job.name}`);
      return;
    }
    const uploadSessionId = job.data?.uploadSessionId;
    if (!uploadSessionId) {
      throw new Error('scan job is missing uploadSessionId');
    }
    await this.uploads.processScan(uploadSessionId);
  }

  /** Mark the session FAILED only once all retries are exhausted. */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<ScanJobData>, error: Error): Promise<void> {
    const maxAttempts = job.opts?.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) return; // more retries pending

    const uploadSessionId = job.data?.uploadSessionId;
    if (!uploadSessionId) return;
    this.logger.error(
      `Scan exhausted ${maxAttempts} attempts for ${uploadSessionId}: ${error?.message}`,
    );
    await this.uploads
      .markScanFailed(uploadSessionId, error?.message ?? 'unknown error')
      .catch((err: unknown) =>
        this.logger.error(
          `Failed to mark session FAILED: ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );
  }
}
