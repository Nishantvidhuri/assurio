/**
 * Lightweight Razorpay Checkout integration.
 *
 * Loads the Razorpay Checkout script on demand and opens the popup with
 * the provided options. Returns a Promise that resolves with the
 * payment response (id + signature) on success, or rejects on dismiss.
 *
 * Set NEXT_PUBLIC_RAZORPAY_KEY in your .env to use a real test/live key.
 * Falls back to Razorpay's public test key documented in their tutorials.
 */

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

export interface RazorpaySuccess {
  razorpay_payment_id: string;
  razorpay_order_id?: string;
  razorpay_signature?: string;
}

export interface RazorpayPrefill {
  name?: string;
  email?: string;
  contact?: string;
}

export interface RazorpayCheckoutOptions {
  /** Amount in paise (e.g. ₹399 = 39900). */
  amount: number;
  currency?: string;
  name: string;
  description?: string;
  prefill?: RazorpayPrefill;
  notes?: Record<string, string>;
  themeColor?: string;
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  image?: string;
  prefill?: RazorpayPrefill;
  notes?: Record<string, string>;
  theme?: { color?: string };
  handler: (response: RazorpaySuccess) => void;
  modal?: {
    ondismiss?: () => void;
    escape?: boolean;
  };
}

interface RazorpayInstance {
  open: () => void;
  close: () => void;
}

const SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Razorpay can only load in the browser'));
  }
  if (window.Razorpay) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SCRIPT_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () =>
        reject(new Error('Failed to load Razorpay')),
      );
      return;
    }
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Razorpay'));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export async function openRazorpayCheckout(
  options: RazorpayCheckoutOptions,
): Promise<RazorpaySuccess> {
  await loadScript();
  const key =
    process.env.NEXT_PUBLIC_RAZORPAY_KEY ?? 'rzp_test_1DP5mmOlF5G5ag';

  return new Promise<RazorpaySuccess>((resolve, reject) => {
    if (!window.Razorpay) {
      reject(new Error('Razorpay not available'));
      return;
    }
    let settled = false;
    const rzp = new window.Razorpay({
      key,
      amount: options.amount,
      currency: options.currency ?? 'INR',
      name: options.name,
      description: options.description,
      prefill: options.prefill,
      notes: options.notes,
      theme: { color: options.themeColor ?? '#1a1612' },
      handler: (response: RazorpaySuccess) => {
        settled = true;
        resolve(response);
      },
      modal: {
        escape: true,
        ondismiss: () => {
          if (!settled) reject(new Error('Payment dismissed'));
        },
      },
    });
    rzp.open();
  });
}
