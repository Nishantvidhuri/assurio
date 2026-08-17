/**
 * Operations monitoring config. The queue list here is the explicit subset the
 * /admin/operations page inspects — to monitor a new queue, register it in
 * OpsModule and add it here.
 */
export const MONITORED_QUEUES: Array<{ name: string; label: string }> = [
  { name: 'outbox', label: 'Outbox / Events' },
  { name: 'candidate-invite', label: 'Candidate Invites' },
  { name: 'subject-draft', label: 'Draft Apply' },
  { name: 'document-processing', label: 'Document Processing' },
  { name: 'virus-scan', label: 'Virus Scan' },
  { name: 'report-generation', label: 'Report Generation' },
  { name: 'invoice-pdf', label: 'Invoice PDFs' },
];

/** BullMQ queue used to run the periodic observability sweep. */
export const MAINTENANCE_QUEUE = 'maintenance';
export const OBSERVABILITY_SWEEP_JOB = 'observability-sweep';
/** Auto-expire unanswered consent requests and refund their wallet holds. */
export const CONSENT_EXPIRY_SWEEP_JOB = 'consent-expiry-sweep';

/** Health thresholds (env-overridable), mirroring Recriauth's defaults. */
export function getDeadJobsThreshold(): number {
  return num(process.env.OPS_QUEUE_DEAD_JOBS_THRESHOLD, 1);
}
export function getBacklogAgeWarningSeconds(): number {
  return num(process.env.OPS_QUEUE_BACKLOG_AGE_WARNING_SECONDS, 120);
}

function num(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt((raw ?? '').trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export type QueueHealthState = 'HEALTHY' | 'WARNING' | 'CRITICAL';

/**
 * FAILED >= dead-jobs threshold → CRITICAL; else backlog age past the warning
 * threshold → WARNING; else HEALTHY. Identical rule to Recriauth.
 */
export function classifyQueueHealth(input: {
  failedCount: number;
  backlogAgeSeconds: number | null;
}): QueueHealthState {
  if (input.failedCount >= getDeadJobsThreshold()) return 'CRITICAL';
  if (
    input.backlogAgeSeconds !== null &&
    input.backlogAgeSeconds >= getBacklogAgeWarningSeconds()
  ) {
    return 'WARNING';
  }
  return 'HEALTHY';
}
