'use client';

import PageLoader from '@/app/components/PageLoader';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Send, TriangleAlert } from 'lucide-react';
import {
  me,
  getWhatsAppScenarios,
  sendWhatsAppScenarios,
  type AuthUser,
  type WaScenario,
} from '../lib/api';
import { getToken } from '../lib/session';
import { doLogout } from '../lib/logout';
import { ICONS, type SidebarItem } from '../components/Sidebar';
import AppShell from '../components/AppShell';
import { Button, Input, Tag } from '@/shared/components';

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
  { href: '/admin/whatsapp', label: 'WhatsApp', icon: ICONS.whatsapp },
];

const DEFAULT_PHONE = '9871202673';

/** WhatsApp markup preview: *bold*, _italic_, bullets and links. */
function renderWa(text: string) {
  return text.split('\n').map((line, i) => {
    if (line.trim() === '') return <div key={i} className="h-2" />;
    const parts = line.split(/(\*[^*]+\*|_[^_]+_|https?:\/\/\S+)/g);
    return (
      <div key={i} className="text-body-sm leading-relaxed text-text-heading">
        {parts.map((part, j) => {
          if (/^\*[^*]+\*$/.test(part)) {
            return (
              <strong key={j} className="font-semibold">
                {part.slice(1, -1)}
              </strong>
            );
          }
          if (/^_[^_]+_$/.test(part)) {
            return (
              <em key={j} className="text-text-subheading">
                {part.slice(1, -1)}
              </em>
            );
          }
          if (/^https?:\/\//.test(part)) {
            return (
              <span key={j} className="break-all text-text-link underline">
                {part}
              </span>
            );
          }
          return <span key={j}>{part}</span>;
        })}
      </div>
    );
  });
}

export default function WhatsAppTestPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [scenarios, setScenarios] = useState<WaScenario[]>([]);
  const [phone, setPhone] = useState(DEFAULT_PHONE);
  const [sending, setSending] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }
    me(token)
      .then((u) => {
        if (u.role !== 'admin') router.replace('/home');
        else setUser(u);
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  useEffect(() => {
    if (!user) return;
    getWhatsAppScenarios()
      .then((r) => setScenarios(r.scenarios))
      .catch(() => setError('Could not load the scenario catalog.'));
  }, [user]);

  const send = useCallback(
    async (ids?: string[]) => {
      const target = phone.trim();
      if (!target) {
        setError('Enter a number first.');
        return;
      }
      setSending(ids && ids.length === 1 ? ids[0] : 'all');
      setError('');
      try {
        const res = await sendWhatsAppScenarios(target, ids);
        setSentIds((prev) => {
          const next = new Set(prev);
          res.results.filter((r) => r.ok).forEach((r) => next.add(r.id));
          return next;
        });
        const failed = res.results.filter((r) => !r.ok);
        if (failed.length > 0) {
          setError(
            `${failed.length} message${failed.length === 1 ? '' : 's'} failed — check the OpenWA session is connected.`,
          );
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Could not send the messages.',
        );
      } finally {
        setSending(null);
      }
    },
    [phone],
  );

  if (!user) return <PageLoader />;

  const candidateOnes = scenarios.filter((s) => s.audience === 'candidate');
  const clientOnes = scenarios.filter((s) => s.audience === 'client');

  const card = (s: WaScenario) => (
    <div
      key={s.id}
      className="flex flex-col overflow-hidden rounded-xl border border-border-default bg-white"
    >
      <div className="flex items-start justify-between gap-3 border-b border-border-default px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-body-md font-semibold text-text-heading">
              {s.label}
            </span>
            {sentIds.has(s.id) && (
              <Tag variant="Success" label="Sent" />
            )}
          </div>
          <p className="mt-0.5 text-body-sm text-text-subheading">
            {s.trigger}
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => void send([s.id])}
          disabled={sending !== null}
          isLoading={sending === s.id}
          className="shrink-0!"
        >
          Send
        </Button>
      </div>

      {/* WhatsApp-style bubble */}
      <div className="flex-1 bg-neutral-100 px-4 py-4">
        <div className="ml-auto max-w-[min(100%,26rem)] rounded-lg rounded-tr-none bg-primary-200 px-3 py-2 shadow-sm">
          {renderWa(s.text)}
        </div>
      </div>
    </div>
  );

  return (
    <AppShell
      nav={ADMIN_NAV}
      user={user}
      onLogout={() => doLogout(router)}
    >
      <div className="mb-4">
        <div className="text-body-sm text-text-placeholder">Operations</div>
        <h1 className="text-h3 font-semibold tracking-h3 text-text-heading">
          WhatsApp message test
        </h1>
        <p className="mt-1 text-body-sm text-text-subheading">
          Every notification the platform sends, with sample data. The preview
          below is the exact text that gets delivered.
        </p>
      </div>

      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-border-default bg-white px-4 py-4">
        <div className="min-w-[220px] flex-1">
          <label className="mb-1 block text-body-sm text-text-body">
            Send to
          </label>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="10-digit number"
          />
        </div>
        <Button
          onClick={() => void send()}
          disabled={sending !== null || scenarios.length === 0}
        >
          <Send size={16} />
          {sending === 'all'
            ? `Sending ${scenarios.length}…`
            : `Send all ${scenarios.length}`}
        </Button>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-border-error bg-surface-error px-4 py-2.5 text-body-sm text-failure">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {sentIds.size > 0 && !error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-border-success bg-surface-success px-4 py-2.5 text-body-sm text-success">
          <Check size={16} className="shrink-0" />
          <span>
            {sentIds.size} of {scenarios.length} delivered to {phone}.
          </span>
        </div>
      )}

      <section className="mb-6">
        <h2 className="mb-3 text-body-lg font-semibold text-text-heading">
          To the candidate
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {candidateOnes.map(card)}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-body-lg font-semibold text-text-heading">
          To the client
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">{clientOnes.map(card)}</div>
      </section>
    </AppShell>
  );
}
