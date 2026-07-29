/**
 * Shared helpers for rendering the credit-based money model in the client.
 *
 * - `formatCreditsNumber`: plain integer with locale grouping (e.g., "1,500"). No unit suffix —
 *   use when the surrounding UI already labels the value.
 * - `formatCredits`: integer + " credits" suffix (e.g., "1,500 credits"). Default for most
 *   non-top-up surfaces.
 * - `formatRupees`: ₹-prefixed INR with 2 decimals (e.g., "₹1,180.00"). Use ONLY for
 *   GST-inclusive (gross) amounts — the tax slice is what makes the paise meaningful.
 *   Examples: credit top-up + Razorpay breakdown, and the postpaid headline numbers
 *   (Billing this month / Outstanding / Total due).
 * - `formatRupeesNet`: ₹-prefixed INR without forced decimals (e.g., "₹1,500", "₹399.5").
 *   Use for pre-GST (net) amounts — postpaid package/add-on prices and the accrual ledger,
 *   which are whole-rupee figures. Showing ".00" on these reads as false precision.
 *
 * The credit-based model: 1 credit = 1 INR. Credit balances are stored as Decimal(14,2)
 * on the server but displayed as integers (whole credits).
 */

export function formatCreditsNumber(value: string | number): string {
  return Math.trunc(Number(value)).toLocaleString('en-IN');
}

export function formatCredits(value: string | number): string {
  return `${formatCreditsNumber(value)} credits`;
}

export function formatRupees(value: string | number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

export function formatRupeesNet(value: string | number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

// Net rupee amount WITHOUT the ₹ symbol — for postpaid totals rendered
// beside the rupee-coin image, where a ₹ prefix would double the currency
// marker. Same no-forced-decimals rule as formatRupeesNet.
export function formatRupeesNetNumber(value: string | number): string {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value));
}
