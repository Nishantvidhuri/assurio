/**
 * Runtime switches for checks we can turn off without touching the code that
 * implements them.
 *
 * The credit-report check is disabled for now. Everything behind it —
 * VerifyService.creditCheck, the poller, the report section — is left intact so
 * flipping the env var brings it straight back; while it's off the vendor is
 * never called, no credits are spent, and the check is not offered, counted, or
 * shown anywhere.
 *
 * Enable with CREDIT_CHECK_ENABLED=true.
 */
export const CREDIT_CHECK_ENABLED =
  process.env.CREDIT_CHECK_ENABLED === 'true';

/**
 * The passport check is disabled for now on the same terms. Enable with
 * PASSPORT_CHECK_ENABLED=true.
 */
export const PASSPORT_CHECK_ENABLED =
  process.env.PASSPORT_CHECK_ENABLED === 'true';
