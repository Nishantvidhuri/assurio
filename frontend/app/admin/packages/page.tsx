'use client';
import PageLoader from '@/app/components/PageLoader';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Plus, Star, Trash2 } from 'lucide-react';
import {
  adminCreateDiscount,
  adminCreatePackage,
  adminDeleteDiscount,
  adminDeletePackage,
  adminDiscounts,
  adminPackages,
  adminUpdateDiscount,
  adminUpdatePackage,
  me,
  type AuthUser,
  type DiscountRow,
  type PackageRow,
} from '../../lib/api';
import { getToken } from '../../lib/session';
import { doLogout } from '../../lib/logout';
import { ICONS, type SidebarItem } from '../../components/Sidebar';
import AppShell from '../../components/AppShell';
import { Button, Input } from '@/shared/components/ui';

const ADMIN_NAV: SidebarItem[] = [
  { href: '/admin', label: 'Dashboard', icon: ICONS.dashboard },
  { href: '/admin/clients', label: 'Clients', icon: ICONS.clients },
  { href: '/admin/invoices', label: 'Invoices', icon: ICONS.invoices },
  { href: '/admin/vendors', label: 'Vendors', icon: ICONS.vendors },
  { href: '/admin/packages', label: 'Packages', icon: ICONS.packages },
  { href: '/admin/operations', label: 'Operations', icon: ICONS.operations },
  {
    href: '/admin/test-verification',
    label: 'Test Verification',
    icon: ICONS.testVerification,
  },
  {
    href: '/admin/whatsapp',
    label: 'WhatsApp',
    icon: ICONS.whatsapp,
  },
];

export default function AdminPackagesPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [discounts, setDiscounts] = useState<DiscountRow[]>([]);
  const [error, setError] = useState('');
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const [npName, setNpName] = useState('');
  const [npPrice, setNpPrice] = useState('');
  const [ndCode, setNdCode] = useState('');
  const [ndPct, setNdPct] = useState('');

  const token = getToken() ?? '';

  useEffect(() => {
    if (!token) {
      router.replace('/login');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const u = await me(token);
        if (cancelled) return;
        if (u.role !== 'admin') {
          router.replace('/home');
          return;
        }
        setUser(u);
        await reload();
      } catch (err) {
        if (cancelled) return;
        if (err instanceof Error && /401|expired|invalid|token/i.test(err.message)) {
          doLogout(router);
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function reload() {
    const [pkgs, discs] = await Promise.all([
      adminPackages(token),
      adminDiscounts(token),
    ]);
    setPackages(pkgs);
    setDiscounts(discs);
    setPrices(
      Object.fromEntries(pkgs.map((p) => [p.id, String(p.priceInr)])),
    );
  }

  function handleLogout() {
    doLogout(router);
  }

  async function guard(fn: () => Promise<unknown>) {
    setError('');
    try {
      await fn();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
  }

  async function savePrice(id: string) {
    setError('');
    setSavingId(id);
    setSavedId(null);
    try {
      await adminUpdatePackage(token, id, { priceInr: Number(prices[id]) });
      await reload();
      // Briefly flag as saved so the button shows a "Saved" confirmation.
      setSavedId(id);
      setTimeout(() => setSavedId((cur) => (cur === id ? null : cur)), 1600);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSavingId(null);
    }
  }

  const createPackage = () =>
    guard(async () => {
      if (!npName.trim() || !npPrice) return;
      await adminCreatePackage(token, {
        name: npName.trim(),
        priceInr: Number(npPrice),
      });
      setNpName('');
      setNpPrice('');
    });

  const createDiscount = () =>
    guard(async () => {
      if (!ndCode.trim() || !ndPct) return;
      await adminCreateDiscount(token, {
        code: ndCode.trim(),
        percentOff: Number(ndPct),
      });
      setNdCode('');
      setNdPct('');
    });

  if (!user) return <PageLoader />;

  return (
    <AppShell nav={ADMIN_NAV} user={user} onLogout={handleLogout}>
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-xl font-semibold text-text-heading">
            Packages &amp; discounts
          </h1>
          <p className="mt-1 text-body-sm text-text-subheading">
            The single source of truth for the bill amount. Checkout reads the
            default package&apos;s price; discount codes apply a % off.
          </p>
        </div>

        {error && (
          <div className="rounded-md border border-border-error bg-surface-error px-4 py-2 text-body-sm text-text-error">
            {error}
          </div>
        )}

        {/* ── Packages ── */}
        <section className="rounded-xl border border-border-default bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-text-heading">
            Packages
          </h2>

          <div className="flex flex-col gap-3">
            {packages.length === 0 && (
              <span className="text-text-placeholder">No packages yet.</span>
            )}
            {packages.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border-default px-4 py-3"
              >
                <div className="min-w-[160px] flex-1">
                  <div className="flex items-center gap-2 font-medium text-text-heading">
                    {p.name}
                    {p.isDefault && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-neutral-200 px-2 py-0.5 text-body-sm text-text-subheading">
                        <Star size={11} /> Default
                      </span>
                    )}
                    {!p.active && (
                      <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-body-sm text-text-placeholder">
                        Inactive
                      </span>
                    )}
                  </div>
                  {p.description && (
                    <div className="text-body-sm text-text-subheading">
                      {p.description}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <span className="text-text-subheading">₹</span>
                  <div className="w-28">
                    <Input
                      value={prices[p.id] ?? ''}
                      inputMode="numeric"
                      onChange={(e) =>
                        setPrices((cur) => ({
                          ...cur,
                          [p.id]: e.target.value,
                        }))
                      }
                    />
                  </div>
                  {(() => {
                    const dirty = (prices[p.id] ?? '') !== String(p.priceInr);
                    const saving = savingId === p.id;
                    const saved = savedId === p.id;
                    return (
                      <Button
                        variant="secondary"
                        disabled={saving || (!dirty && !saved)}
                        onClick={() => savePrice(p.id)}
                      >
                        {saving ? (
                          <>
                            <Loader2 className="size-4 animate-spin" />
                            Saving…
                          </>
                        ) : saved && !dirty ? (
                          <>
                            <Check className="size-4" />
                            Saved
                          </>
                        ) : (
                          'Save'
                        )}
                      </Button>
                    );
                  })()}
                </div>

                <Button
                  variant="link"
                  onClick={() =>
                    guard(() =>
                      adminUpdatePackage(token, p.id, { isDefault: true }),
                    )
                  }
                  disabled={p.isDefault}
                >
                  Make default
                </Button>
                <Button
                  variant="link"
                  onClick={() =>
                    guard(() =>
                      adminUpdatePackage(token, p.id, { active: !p.active }),
                    )
                  }
                >
                  {p.active ? 'Deactivate' : 'Activate'}
                </Button>
                <button
                  type="button"
                  aria-label="Delete package"
                  className="rounded p-1.5 text-text-subheading hover:text-text-error"
                  onClick={() =>
                    guard(() => adminDeletePackage(token, p.id))
                  }
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>

          {/* New package */}
          <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-border-default pt-5">
            <div className="min-w-[200px] flex-1">
              <div className="mb-1 text-body-sm text-text-subheading">
                Package name
              </div>
              <Input
                value={npName}
                placeholder="e.g. Premium verification"
                onChange={(e) => setNpName(e.target.value)}
              />
            </div>
            <div className="w-32">
              <div className="mb-1 text-body-sm text-text-subheading">
                Price (₹)
              </div>
              <Input
                value={npPrice}
                inputMode="numeric"
                placeholder="399"
                onChange={(e) => setNpPrice(e.target.value)}
              />
            </div>
            <Button variant="primary" onClick={createPackage}>
              <Plus size={15} />
              Add package
            </Button>
          </div>
        </section>

        {/* ── Discount codes ── */}
        <section className="rounded-xl border border-border-default bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-text-heading">
            Discount codes
          </h2>

          <div className="flex flex-col gap-3">
            {discounts.length === 0 && (
              <span className="text-text-placeholder">
                No discount codes yet.
              </span>
            )}
            {discounts.map((d) => (
              <div
                key={d.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border-default px-4 py-3"
              >
                <div className="flex-1 font-mono font-medium text-text-heading">
                  {d.code}
                </div>
                <div className="text-text-body">{d.percentOff}% off</div>
                {!d.active && (
                  <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-body-sm text-text-placeholder">
                    Inactive
                  </span>
                )}
                <Button
                  variant="link"
                  onClick={() =>
                    guard(() =>
                      adminUpdateDiscount(token, d.id, { active: !d.active }),
                    )
                  }
                >
                  {d.active ? 'Deactivate' : 'Activate'}
                </Button>
                <button
                  type="button"
                  aria-label="Delete code"
                  className="rounded p-1.5 text-text-subheading hover:text-text-error"
                  onClick={() =>
                    guard(() => adminDeleteDiscount(token, d.id))
                  }
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>

          {/* New discount */}
          <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-border-default pt-5">
            <div className="min-w-[160px] flex-1">
              <div className="mb-1 text-body-sm text-text-subheading">Code</div>
              <Input
                value={ndCode}
                placeholder="e.g. WELCOME20"
                onChange={(e) => setNdCode(e.target.value.toUpperCase())}
              />
            </div>
            <div className="w-28">
              <div className="mb-1 text-body-sm text-text-subheading">
                % off
              </div>
              <Input
                value={ndPct}
                inputMode="numeric"
                placeholder="20"
                onChange={(e) => setNdPct(e.target.value)}
              />
            </div>
            <Button variant="primary" onClick={createDiscount}>
              <Plus size={15} />
              Add code
            </Button>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
