import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { OutboxService } from '../outbox/outbox.service';
import { OperationalAlertsService } from './operational-alerts.service';
import { QueueMonitoringService } from './queue-monitoring.service';
import { ObservabilityService } from './observability.service';
import {
  classifyQueueHealth,
  getBacklogAgeWarningSeconds,
  getDeadJobsThreshold,
  MONITORED_QUEUES,
} from './ops.constants';

/**
 * Assembles the /admin/operations overview: live queue health (with the
 * CRITICAL/WARNING/HEALTHY classification), active alerts, recent jobs, and
 * outbox stats — the whole page in one call.
 */
@Injectable()
export class OpsService {
  constructor(
    private readonly queues: QueueMonitoringService,
    private readonly alerts: OperationalAlertsService,
    private readonly observability: ObservabilityService,
    private readonly outbox: OutboxService,
    @InjectQueue('candidate-invite') private readonly recentJobsQueue: Queue,
  ) {}

  async getOverview() {
    const [states, activeAlerts, outboxStats, recentOutboxEvents, recentJobs] =
      await Promise.all([
        this.queues.getLiveQueueStates(),
        this.alerts.listActive(25),
        this.outbox.stats(),
        this.outbox.recentEvents(20),
        this.recentJobsQueue.getJobs(['completed', 'failed', 'active'], 0, 14),
      ]);

    return {
      generatedAt: new Date().toISOString(),
      thresholds: {
        deadJob: getDeadJobsThreshold(),
        backlogSec: getBacklogAgeWarningSeconds(),
      },
      queues: states.map((q) => ({
        name: q.name,
        label: q.label,
        health: classifyQueueHealth({
          failedCount: q.failed,
          backlogAgeSeconds: q.backlogAgeSeconds,
        }),
        waiting: q.waiting,
        active: q.active,
        delayed: q.delayed,
        failed: q.failed,
        paused: q.paused,
        backlogAgeSeconds: q.backlogAgeSeconds,
        oldestWaiting: q.oldestWaiting,
        oldestFailed: q.oldestFailed,
      })),
      activeAlerts: activeAlerts.map((a) => ({
        id: a.id,
        type: a.type,
        severity: a.severity,
        status: a.status,
        queueName: a.queueName,
        title: a.title,
        message: a.message,
        occurrenceCount: a.occurrenceCount,
        firstOccurredAt: a.firstOccurredAt.toISOString(),
        lastOccurredAt: a.lastOccurredAt.toISOString(),
        acknowledgedAt: a.acknowledgedAt ? a.acknowledgedAt.toISOString() : null,
      })),
      monitoredQueueCount: MONITORED_QUEUES.length,
      recentJobs: recentJobs.map((job) => ({
        queue: 'candidate-invite',
        name: job.name,
        status: job.finishedOn
          ? job.failedReason
            ? 'failed'
            : 'completed'
          : 'active',
        progress: typeof job.progress === 'number' ? job.progress : 0,
        attempts: job.attemptsMade,
        timestamp: job.timestamp,
        finishedOn: job.finishedOn ?? null,
        failedReason: job.failedReason ?? null,
      })),
      outboxStats,
      recentOutboxEvents,
    };
  }

  acknowledgeAlert(alertId: string, userId?: string) {
    return this.alerts.acknowledge(alertId, userId);
  }

  /** Manual "Run reconciliation" — runs the observability sweep on demand. */
  async runReconciliation(): Promise<{ ok: true }> {
    await this.observability.runSweep();
    return { ok: true };
  }
}
