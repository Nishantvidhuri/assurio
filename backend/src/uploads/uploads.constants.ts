/**
 * Shared constants for the durable document-upload pipeline.
 *
 * Two in-process BullMQ queues:
 *  - `document-processing` handles the `finalize` job (verify the client's
 *    direct-to-S3 PUT) and the repeatable `reconcile` job (crash recovery +
 *    expiry sweep).
 *  - `virus-scan` handles the `scan` job (ClamAV, fail-closed).
 *
 * Job payloads carry IDs only. Enqueue is idempotent via deterministic
 * jobIds so the eager (confirm/finalize) path and the reconcile fallback
 * dedupe against each other.
 */

export const UPLOAD_QUEUES = {
  DOCUMENT_PROCESSING: 'document-processing',
  VIRUS_SCAN: 'virus-scan',
} as const;

export const UPLOAD_JOBS = {
  FINALIZE: 'finalize',
  SCAN: 'scan',
  RECONCILE: 'reconcile',
} as const;

/** Presigned PUT / session TTL. Matches the reconcile expiry window. */
export const UPLOAD_URL_TTL_SECONDS = 15 * 60;

/** How often the reconcile/expiry sweep runs. */
export const RECONCILE_EVERY_MS = 60_000;

/** Stable BullMQ job id for the repeatable reconcile job. */
export const RECONCILE_JOB_ID = 'upload-reconcile';

/** Deterministic per-session job ids — cross-path idempotency. Colon-free:
 *  BullMQ uses ':' as its Redis key separator, so custom job ids must avoid it. */
export const finalizeJobId = (sessionId: string) => `upload-finalize-${sessionId}`;
export const scanJobId = (sessionId: string) => `upload-scan-${sessionId}`;

export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

/** Allowed MIME types → canonical file extension. */
export const ALLOWED_CONTENT_TYPES: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
};
