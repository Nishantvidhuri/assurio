export interface InternalOpsQueueState {
  queueName: string;
  displayName: string;
  health: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  waitingCount: number;
  activeCount: number;
  delayedCount: number;
  failedCount: number;
  pausedCount: number;
  prioritizedCount: number;
  waitingChildrenCount: number;
  backlogAgeSeconds: number | null;
  oldestWaitingJobId: string | null;
  oldestWaitingJobAt: string | null;
  oldestFailedJobId: string | null;
  oldestFailedJobAt: string | null;
}

export interface OperationalAlertView {
  id: string;
  dedupeKey: string;
  type: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
  queueName: string | null;
  resourceType: string | null;
  resourceId: string | null;
  title: string;
  message: string;
  occurrenceCount: number;
  firstOccurredAt: string;
  lastOccurredAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  metadata: Record<string, unknown> | null;
  acknowledgedBy: {
    id: string;
    name: string;
    email: string;
  } | null;
}

export interface QueueMetricSnapshotView {
  id: string;
  queueName: string;
  waitingCount: number;
  activeCount: number;
  delayedCount: number;
  completedCount: number;
  failedCount: number;
  pausedCount: number;
  prioritizedCount: number;
  waitingChildrenCount: number;
  backlogAgeSeconds: number | null;
  oldestWaitingJobId: string | null;
  oldestWaitingJobAt: string | null;
  oldestFailedJobId: string | null;
  oldestFailedJobAt: string | null;
  createdAt: string;
}

export interface InternalOpsSystemJob {
  id: string;
  queueName: string;
  queueDisplayName: string;
  jobName: string;
  status: string;
  progressPercent: number;
  statusMessage: string | null;
  attempts: number;
  maxAttempts: number;
  errorMessage: string | null;
  queuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
}

export interface InternalOpsOverview {
  generatedAt: string;
  dashboardUrl: string;
  queues: InternalOpsQueueState[];
  activeAlerts: OperationalAlertView[];
  recentAlerts: OperationalAlertView[];
  recentQueueSnapshots: QueueMetricSnapshotView[];
  recentSystemJobs: InternalOpsSystemJob[];
  thresholds: {
    backlogAgeWarningSeconds: number;
    deadJobsThreshold: number;
    webhookLagWarningSeconds: number;
    emailFailureRateWarningPercent: number;
    importFailureSpikeWarningPercent: number;
  };
}

export interface InternalOpsQueuedJob {
  id: string;
  queueName: string;
  jobName: string;
  status: string;
  progressPercent: number;
  statusMessage: string | null;
  queuedAt: string;
}
