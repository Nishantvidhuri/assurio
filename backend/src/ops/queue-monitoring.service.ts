import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { MONITORED_QUEUES } from './ops.constants';

export interface LiveQueueState {
  name: string;
  label: string;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  paused: number;
  backlogAgeSeconds: number | null;
  oldestWaiting: string | null;
  oldestFailed: string | null;
}

/**
 * Reads live BullMQ counts (from Redis) for every monitored queue. The queues
 * are injected read-only; this service never adds jobs.
 */
@Injectable()
export class QueueMonitoringService {
  private readonly queues: Record<string, Queue>;

  constructor(
    @InjectQueue('outbox') outbox: Queue,
    @InjectQueue('candidate-invite') candidateInvite: Queue,
    @InjectQueue('subject-draft') subjectDraft: Queue,
    @InjectQueue('document-processing') documentProcessing: Queue,
    @InjectQueue('virus-scan') virusScan: Queue,
    @InjectQueue('report-generation') reportGeneration: Queue,
    @InjectQueue('invoice-pdf') invoicePdf: Queue,
  ) {
    this.queues = {
      outbox,
      'candidate-invite': candidateInvite,
      'subject-draft': subjectDraft,
      'document-processing': documentProcessing,
      'virus-scan': virusScan,
      'report-generation': reportGeneration,
      'invoice-pdf': invoicePdf,
    };
  }

  async getLiveQueueStates(): Promise<LiveQueueState[]> {
    return Promise.all(
      MONITORED_QUEUES.map((def) => this.inspect(def.name, def.label)),
    );
  }

  private async inspect(name: string, label: string): Promise<LiveQueueState> {
    const queue = this.queues[name];
    if (!queue) {
      return {
        name,
        label,
        waiting: 0,
        active: 0,
        delayed: 0,
        failed: 0,
        paused: 0,
        backlogAgeSeconds: null,
        oldestWaiting: null,
        oldestFailed: null,
      };
    }
    const [counts, waitingJobs, failedJobs, isPaused] = await Promise.all([
      queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'paused'),
      queue.getWaiting(0, 24),
      queue.getFailed(0, 24),
      queue.isPaused(),
    ]);

    const oldestWaitingTs =
      waitingJobs.length > 0
        ? Math.min(...waitingJobs.map((j) => j.timestamp))
        : null;
    const oldestFailedTs =
      failedJobs.length > 0
        ? Math.min(...failedJobs.map((j) => j.finishedOn ?? j.timestamp))
        : null;

    return {
      name,
      label,
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      delayed: counts.delayed ?? 0,
      failed: counts.failed ?? 0,
      paused: isPaused ? counts.paused ?? 0 : 0,
      backlogAgeSeconds:
        oldestWaitingTs !== null
          ? Math.floor((Date.now() - oldestWaitingTs) / 1000)
          : null,
      oldestWaiting:
        oldestWaitingTs !== null ? new Date(oldestWaitingTs).toISOString() : null,
      oldestFailed:
        oldestFailedTs !== null ? new Date(oldestFailedTs).toISOString() : null,
    };
  }
}
