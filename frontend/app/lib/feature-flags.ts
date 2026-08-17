/**
 * Runtime switches, mirroring backend/src/common/feature-flags.ts.
 *
 * The credit-report check is off for now: it isn't offered on the new-check
 * form, isn't counted in progress, and its card is hidden. The implementation
 * stays in place — set NEXT_PUBLIC_CREDIT_CHECK_ENABLED=true (and
 * CREDIT_CHECK_ENABLED=true on the backend) to bring it back.
 */
export const CREDIT_CHECK_ENABLED =
  process.env.NEXT_PUBLIC_CREDIT_CHECK_ENABLED === 'true';

/** Passport is off for now, on the same terms. */
export const PASSPORT_CHECK_ENABLED =
  process.env.NEXT_PUBLIC_PASSPORT_CHECK_ENABLED === 'true';
