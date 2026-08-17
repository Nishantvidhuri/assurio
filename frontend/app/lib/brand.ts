/**
 * Brand colors for the few places that need a literal hex string instead of a
 * CSS variable — third-party SDKs (Razorpay's checkout theme) render outside
 * our stylesheet.
 *
 * KEEP IN SYNC with the MASTER PALETTE in app/rds.css (@theme block) — that is
 * the single source of truth for the app's colors.
 */
export const BRAND = {
  /** --color-brand-600 — primary violet */
  primary: '#5b4fe8',
  /** --color-ink-400 — dark ink used on primary buttons / dark chrome */
  ink: '#191831',
} as const;
