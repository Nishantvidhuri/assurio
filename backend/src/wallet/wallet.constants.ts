/**
 * Client-wallet configuration and the idempotency-key builders that make every
 * money movement exactly-once. The keys are the security model: each key names
 * one real-world event (this payment, this subject's charge, this subject's
 * refund), and the DB-level unique constraint on WalletTransaction.idempotencyKey
 * guarantees the event can only ever be applied once.
 */

/** ₹1 = 100 paise. All ledger amounts are integer paise. */
export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function paiseToRupees(paise: number): number {
  return Math.round(paise) / 100;
}

/** Minimum single top-up: ₹100. */
export const MIN_TOPUP_PAISE = 10_000;
/** Maximum single top-up: ₹2,00,000. */
export const MAX_TOPUP_PAISE = 20_000_000;
/**
 * Wallet balance cap: ₹10,00,000 — far below the Int32 paise limit (₹2.14 cr),
 * so integer overflow is unreachable. Refunds bypass the cap (a refund must
 * never fail), which still cannot overflow: refunds only return money that
 * passed the cap on the way in.
 */
export const MAX_BALANCE_PAISE = 100_000_000;

/**
 * Only Razorpay payments made after the wallet ledger shipped may be credited
 * as top-ups. Blocks replaying pre-wallet paymentIds (already consumed by the
 * legacy create flow, but never recorded in the ledger) for free credit.
 */
export const WALLET_LEDGER_EPOCH = new Date(
  process.env.WALLET_LEDGER_EPOCH || '2026-08-10T00:00:00Z',
);

/** Days a candidate has to answer the consent request before the hold auto-refunds. */
export function consentExpiryDays(): number {
  const n = Number.parseInt(process.env.CONSENT_EXPIRY_DAYS ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : 7;
}

/** One verification charge per subject — ever. */
export function chargeKey(subjectId: string): string {
  return `charge:subject:${subjectId}`;
}

/** One consent refund per subject — ever. Mirrors chargeKey exactly. */
export function refundKey(subjectId: string): string {
  return `refund:subject:${subjectId}`;
}

/** One wallet credit per verified Razorpay payment — ever. */
export function topupKey(razorpayPaymentId: string): string {
  return `topup:rzp:${razorpayPaymentId}`;
}
