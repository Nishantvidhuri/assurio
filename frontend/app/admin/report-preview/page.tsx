'use client';
import PageLoader from '@/app/components/PageLoader';

/**
 * Report preview sandbox — renders the candidate Background Verification Report
 * in three states (all success / with pending / with failed) using fabricated
 * mock data, so the layout can be reviewed without a real candidate. Each card
 * opens the actual PDF (same renderer the download uses) in a modal.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  Hourglass,
  AlertTriangle,
  FileText,
  X,
} from 'lucide-react';
import {
  me,
  mockReportBlobUrl,
  type AuthUser,
  type MockReportVariant,
} from '../../lib/api';
import { getToken } from '../../lib/session';
import { doLogout } from '../../lib/logout';
import { ICONS, type SidebarItem } from '../../components/Sidebar';
import AppShell from '../../components/AppShell';

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
];

interface Variant {
  key: MockReportVariant;
  title: string;
  desc: string;
  icon: React.ReactNode;
  tone: string;
}

const VARIANTS: Variant[] = [
  {
    key: 'success',
    title: 'All checks passed',
    desc: 'Every one of the eight checks completed with clean, matching data.',
    icon: <CheckCircle2 className="size-6 text-success" />,
    tone: 'border-border-success bg-surface-success',
  },
  {
    key: 'pending',
    title: 'Some checks pending',
    desc: 'A couple of checks are back; the rest are still awaiting the vendor.',
    icon: <Hourglass className="size-6 text-warning" />,
    tone: 'border-border-warning bg-surface-warning',
  },
  {
    key: 'failed',
    title: 'Checks failed',
    desc: 'Genuine failed lookups (invalid / not found) across most checks.',
    icon: <AlertTriangle className="size-6 text-failure" />,
    tone: 'border-border-error bg-surface-error',
  },
];

export default function ReportPreviewPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState('');
  const [active, setActive] = useState<Variant | null>(null);

  useEffect(() => {
    const token = getToken();
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
  }, [router]);

  if (!user) return <PageLoader />;

  return (
    <AppShell
      nav={ADMIN_NAV}
      user={user}
      onLogout={() => doLogout(router)}
      breadcrumbs={[
        { label: 'Home', href: '/admin' },
        { label: 'Report preview' },
      ]}
    >
      <div className="shell-head">
        <div>
          <h1 className="page-title">Report preview</h1>
          <p className="page-sub">
            A sample Background Verification Report in three states, rendered from
            mock data with the same engine as a real candidate&apos;s download.
          </p>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {VARIANTS.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => setActive(v)}
            className={`flex flex-col items-start gap-3 rounded-xl border p-5 text-left transition-shadow hover:shadow-md ${v.tone}`}
          >
            <div className="flex size-11 items-center justify-center rounded-lg bg-white/70">
              {v.icon}
            </div>
            <div>
              <div className="text-body-lg font-semibold text-text-heading">
                {v.title}
              </div>
              <div className="mt-1 text-body-sm text-text-body">{v.desc}</div>
            </div>
            <span className="mt-1 inline-flex items-center gap-1.5 text-body-sm font-medium text-text-link">
              <FileText size={15} />
              Preview report
            </span>
          </button>
        ))}
      </div>

      {active && (
        <ReportModal variant={active} onClose={() => setActive(null)} />
      )}
    </AppShell>
  );
}

function ReportModal({
  variant,
  onClose,
}: {
  variant: Variant;
  onClose: () => void;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    setBlobUrl(null);
    setError(null);
    (async () => {
      try {
        const token = getToken();
        if (!token) throw new Error('Your session has expired.');
        const url = await mockReportBlobUrl(token, variant.key);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        created = url;
        setBlobUrl(url);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load report');
        }
      }
    })();
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [variant.key]);

  return (
    <div className="pdf-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="pdf-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${variant.title} report preview`}
      >
        <header className="pdf-modal-head">
          <div className="pdf-modal-title">{variant.title} — report preview</div>
          <div className="pdf-modal-actions">
            {blobUrl && (
              <a
                className="pdf-modal-link"
                href={blobUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open in new tab ↗
              </a>
            )}
            <button
              type="button"
              className="pdf-modal-close"
              onClick={onClose}
              aria-label="Close preview"
            >
              <X size={18} />
            </button>
          </div>
        </header>
        {error ? (
          <div className="pdf-modal-empty">
            <div>Couldn&apos;t load the report preview.</div>
            <div className="pdf-modal-empty-sub">{error}</div>
          </div>
        ) : !blobUrl ? (
          <div className="pdf-modal-empty">
            <div>Rendering report…</div>
          </div>
        ) : (
          <iframe
            className="pdf-modal-frame"
            src={blobUrl}
            title={`${variant.title} report preview`}
          />
        )}
      </div>
    </div>
  );
}
