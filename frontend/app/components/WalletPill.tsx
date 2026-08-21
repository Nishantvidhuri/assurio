'use client';

/**
 * Top-bar wallet pill for client accounts — mirrors Recriauth's credits pill
 * (same RDS shape: h-10 rounded-full, coin badge, balance text), with the
 * rupee coin since Recrify's wallet is money, not credits.
 *
 * Refreshes on every route change and whenever something spends or tops up the
 * wallet — those flows dispatch `recrify:wallet-updated`, so the balance never
 * goes stale after a payment or a consent refund.
 */
import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/shared/lib/utils';
import { getWallet } from '../lib/api';
import { getToken } from '../lib/session';

export const WALLET_UPDATED_EVENT = 'recrify:wallet-updated';

/** Tell every mounted WalletPill to re-fetch (call after a top-up / charge). */
export function notifyWalletUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(WALLET_UPDATED_EVENT));
  }
}

function fmtBalance(inr: number): string {
  return (
    '₹' +
    inr.toLocaleString('en-IN', {
      minimumFractionDigits: Number.isInteger(inr) ? 0 : 2,
      maximumFractionDigits: 2,
    })
  );
}

export default function WalletPill() {
  const pathname = usePathname();
  const [balance, setBalance] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const w = await getWallet(token);
      setBalance(w.balanceInr);
    } catch {
      // Silently swallow — the pill just won't update this tick.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, pathname]);

  useEffect(() => {
    const onUpdate = () => void refresh();
    window.addEventListener(WALLET_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(WALLET_UPDATED_EVENT, onUpdate);
  }, [refresh]);

  return (
    <Link
      href="/home/billing"
      aria-label="Wallet balance — add money"
      title="Wallet balance"
      className={cn(
        'flex h-10 shrink-0 items-center gap-[6px] rounded-full border border-border-default bg-surface-page',
        'pl-1.5 pr-3 py-1.5',
        'transition-colors hover:bg-neutral-300',
      )}
    >
      <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-warning-100">
        <Image
          src="/assets/client-billing/rupee-coin.png"
          height={24}
          width={24}
          alt=""
          className="object-contain"
        />
      </span>
      <span className="whitespace-nowrap text-body-sm font-medium leading-[20px] tracking-body-sm text-text-heading">
        {balance === null ? '—' : fmtBalance(balance)}
      </span>
    </Link>
  );
}
