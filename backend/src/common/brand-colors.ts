/**
 * Recrify brand palette for server-rendered surfaces — the report PDF, the
 * invoice PDF, and transactional emails. These can't read the frontend's CSS
 * variables, so the hex values live here instead.
 *
 * SINGLE SOURCE RULE: this file mirrors the MASTER PALETTE in
 * frontend/app/rds.css (@theme block). To rebrand, edit that block and this
 * file — nothing else.
 *
 * Current palette: "Violet & Ink".
 */
export const BRAND = {
  /* Brand (violet) */
  primary: '#5b4fe8', // brand-600
  primaryDeep: '#3e34ab', // brand-800
  primaryDark: '#302a85', // brand-900
  primaryTint: '#eae7fc', // brand-200
  primaryBg: '#f8f7fe', // brand-100

  /* Ink (dark chrome) */
  ink: '#191831', // ink-400
  inkDeep: '#0d0c19', // ink-800

  /* Text + neutrals */
  textHeading: '#100f21', // neutral-900
  textBody: '#3a3850', // neutral-800
  textMuted: '#85839d', // neutral-700
  textDisabled: '#a6a5b6', // neutral-600
  border: '#eeeef0', // neutral-400
  borderSoft: '#e5e4ef', // neutral-500
  surface: '#f9f8fe', // neutral-200
  white: '#ffffff',

  /* Status */
  success: '#2fab5d',
  successTint: '#eaf7ef',
  failure: '#e33939',
  failureTint: '#fcebeb',
  warning: '#ffb522',
  warningTint: '#fff9ec',
} as const;
