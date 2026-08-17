import { Injectable, Logger } from '@nestjs/common';
import {
  OperationalAlertSeverity,
  OperationalAlertType,
} from '../../generated/prisma/client';
import { OperationalAlertsService } from './operational-alerts.service';
import { QueueMonitoringService } from './queue-monitoring.service';
import { getBacklogAgeWarningSeconds, getDeadJobsThreshold } from './ops.constants';

/**
 * Periodic sweep (run by the maintenance queue every minute). For each queue it
 * raises DEAD_JOBS when failed jobs pile up and QUEUE_BACKLOG_AGE when the
 * oldest waiting job is too old — and resolves them when the condition clears.
 * Mirrors Recriauth's evaluateQueueHealth.
 */
@Injectable()
export class ObservabilityService {
  private readonly logger = new Logger(ObservabilityService.name);

  constructor(
    private readonly queues: QueueMonitoringService,
    private readonly alerts: OperationalAlertsService,
  ) {}

  async runSweep(): Promise<void> {
    const states = await this.queues.getLiveQueueStates();
    const deadThreshold = getDeadJobsThreshold();
    const backlogThreshold = getBacklogAgeWarningSeconds();

    for (const q of states) {
      // Dead jobs → CRITICAL
      const deadKey = `dead-jobs:${q.name}`;
      if (q.failed >= deadThreshold) {
        await this.alerts.raise({
          dedupeKey: deadKey,
          type: OperationalAlertType.DEAD_JOBS,
          severity: OperationalAlertSeverity.CRITICAL,
          queueName: q.name,
          title: `${q.label}: failed jobs`,
          message: `${q.failed} failed job(s) on "${q.name}" (threshold ${deadThreshold}). Inspect and retry from the BullMQ dashboard.`,
          metadata: { failed: q.failed, threshold: deadThreshold },
        });
      } else {
        await this.alerts.resolveByDedupeKey(deadKey);
      }

      // Backlog age → WARNING
      const backlogKey = `queue-backlog-age:${q.name}`;
      if (q.backlogAgeSeconds !== null && q.backlogAgeSeconds >= backlogThreshold) {
        await this.alerts.raise({
          dedupeKey: backlogKey,
          type: OperationalAlertType.QUEUE_BACKLOG_AGE,
          severity: OperationalAlertSeverity.WARNING,
          queueName: q.name,
          title: `${q.label}: backlog building`,
          message: `Oldest waiting job on "${q.name}" is ${q.backlogAgeSeconds}s old (threshold ${backlogThreshold}s). The worker may be stuck or under-provisioned.`,
          metadata: { backlogAgeSeconds: q.backlogAgeSeconds, threshold: backlogThreshold },
        });
      } else {
        await this.alerts.resolveByDedupeKey(backlogKey);
      }
    }
    this.logger.debug(`Observability sweep evaluated ${states.length} queues`);
  }
}
