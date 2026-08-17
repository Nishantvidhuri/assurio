import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { UploadsService } from './uploads.service';
import { UPLOAD_JOBS, UPLOAD_QUEUES } from './uploads.constants';

interface FinalizeJobData {
  uploadSessionId?: string;
}

/**
 * In-process worker for the `document-processing` queue. Handles the
 * `finalize` job (verify the client's direct PUT) and the repeatable
 * `reconcile` job (crash recovery + expiry). Concurrency 4.
 */
@Processor(UPLOAD_QUEUES.DOCUMENT_PROCESSING, { concurrency: 4 })
export class DocumentProcessingProcessor extends WorkerHost {
  private readonly logger = new Logger(DocumentProcessingProcessor.name);

  constructor(private readonly uploads: UploadsService) {
    super();
  }

  async process(job: Job<FinalizeJobData>): Promise<void> {
    if (job.name === UPLOAD_JOBS.RECONCILE) {
      const result = await this.uploads.reconcile();
      if (result.expired || result.finalized || result.scanned) {
        this.logger.log(
          `Reconcile: expired=${result.expired} finalize=${result.finalized} scan=${result.scanned}`,
        );
      }
      return;
    }

    if (job.name === UPLOAD_JOBS.FINALIZE) {
      const uploadSessionId = job.data?.uploadSessionId;
      if (!uploadSessionId) {
        throw new Error('finalize job is missing uploadSessionId');
      }
      await this.uploads.processFinalize(uploadSessionId);
      return;
    }

    this.logger.warn(`Ignoring unsupported document-processing job ${job.name}`);
  }

  /** Mark the session FAILED only once all retries are exhausted. */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<FinalizeJobData>, error: Error): Promise<void> {
    if (job.name !== UPLOAD_JOBS.FINALIZE) return;
    const maxAttempts = job.opts?.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) return; // more retries pending

    const uploadSessionId = job.data?.uploadSessionId;
    if (!uploadSessionId) return;
    this.logger.error(
      `Finalize exhausted ${maxAttempts} attempts for ${uploadSessionId}: ${error?.message}`,
    );
    await this.uploads
      .markFinalizeFailed(uploadSessionId, error?.message ?? 'unknown error')
      .catch((err: unknown) =>
        this.logger.error(
          `Failed to mark session FAILED: ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );
  }
}
