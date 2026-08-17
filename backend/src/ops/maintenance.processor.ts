import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger, type OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { ObservabilityService } from './observability.service';
import { ConsentSettlementService } from '../wallet/consent-settlement.service';
import {
  CONSENT_EXPIRY_SWEEP_JOB,
  MAINTENANCE_QUEUE,
  OBSERVABILITY_SWEEP_JOB,
} from './ops.constants';

/**
 * Runs the observability sweep on a repeatable BullMQ job every 60s (deduped by
 * a fixed jobId, mirroring the outbox reconcile pattern). In-process worker —
 * jobs persist in Redis, so the sweep resumes after a crash/restart.
 */
@Processor(MAINTENANCE_QUEUE)
export class MaintenanceProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(MaintenanceProcessor.name);

  constructor(
    @InjectQueue(MAINTENANCE_QUEUE) private readonly queue: Queue,
    private readonly observability: ObservabilityService,
    private readonly settlement: ConsentSettlementService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.queue.add(
      OBSERVABILITY_SWEEP_JOB,
      {},
      {
        repeat: { every: 60_000 },
        jobId: 'observability-sweep',
        removeOnComplete: 20,
        removeOnFail: 20,
      },
    );
    // Every 15 min: expire consent requests unanswered past the deadline and
    // refund their wallet holds. Idempotent + race-proof per subject, so a
    // missed or doubled run can never mis-move money.
    await this.queue.add(
      CONSENT_EXPIRY_SWEEP_JOB,
      {},
      {
        repeat: { every: 15 * 60_000 },
        jobId: 'consent-expiry-sweep',
        removeOnComplete: 20,
        removeOnFail: 20,
      },
    );
  }

  async process(job: Job): Promise<void> {
    if (job.name === OBSERVABILITY_SWEEP_JOB) {
      try {
        await this.observability.runSweep();
      } catch (err) {
        this.logger.warn(
          `Observability sweep failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        throw err;
      }
    }
    if (job.name === CONSENT_EXPIRY_SWEEP_JOB) {
      try {
        await this.settlement.expireStale();
      } catch (err) {
        this.logger.warn(
          `Consent-expiry sweep failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        throw err;
      }
    }
  }
}
