export const CRIME_POLL_QUEUE = 'crime-poll';
export const CRIME_POLL_JOB = 'sweep';

/**
 * Stable jobId so exactly one schedule survives restarts, matching the
 * uploads/outbox repeatable-job precedent. BullMQ rejects colons here.
 */
export const CRIME_POLL_JOB_ID = 'crime-poll-sweep';

/**
 * Every 10 minutes. The vendor quotes 24-48 hours and the report GET costs no
 * credits, so this is about bounding how stale a finished check can look, not
 * about speed — ~144 polls per check over a two-day wait.
 */
export const CRIME_POLL_EVERY_MS = 10 * 60 * 1000;

/**
 * Give up after 72 hours — comfortably past the vendor's quoted 24-48h, so a
 * slow-but-live check is never cut short. The cap exists because the vendor
 * bills some error responses (their 500 example carries credits_used: 3), so a
 * check that can never resolve must not be polled indefinitely. Timing out
 * records an unresolved failure, which an operator can pass manually or re-run.
 */
export const CRIME_POLL_MAX_AGE_MS = 72 * 60 * 60 * 1000;
