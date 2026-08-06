'use client';
import PageLoader from '@/app/components/PageLoader';

/**
 * Admin read-only view of a client's in-progress draft — shows every field the
 * client filled (and what's still blank). No "Continue Form" / edit actions;
 * the admin can only look. Completed candidates open /admin/subject/[id]
 * instead (which shows the verification report + download).
 */
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Eye, FileText } from 'lucide-react';
import {
  adminDraft,
  me,
  type AdminDraftDetail,
  type AuthUser,
} from '../../../lib/api';
import { getToken } from '../../../lib/session';
import { doLogout } from '../../../lib/logout';
import { ICONS, type SidebarItem } from '../../../components/Sidebar';
import AppShell from '../../../components/AppShell';
import { useAdminSwitchers } from '../../../components/useAdminSwitchers';
import FilePreviewModal, {
  type PreviewFile,
} from '../../../components/FilePreviewModal';
import { Tag } from '@/shared/components/ui';

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

interface DraftDoc {
  name?: string;
  url?: string | null;
  size?: number;
  contentType?: string;
}

/** File-type badge icon (same assets/behaviour as Recriauth's FileTypeIcon). */
function FileTypeIcon({ filename }: { filename: string }) {
  const ext = (filename.split('.').pop() ?? '').toLowerCase();
  const src =
    ext === 'pdf'
      ? '/assets/icons/file-type/PDF.svg'
      : ['jpg', 'jpeg', 'png', 'webp', 'svg'].includes(ext)
        ? '/assets/icons/file-type/JPG.svg'
        : null;
  if (!src) return <FileText className="size-5 shrink-0 text-icon-muted" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" width={20} height={24} className="shrink-0" />;
}

function Field({ label, value }: { label: string; value?: unknown }) {
  const v =
    value === null || value === undefined ? '' : String(value).trim();
  return (
    <div>
      <div className="text-body-sm text-text-subheading">{label}</div>
      <div className="mt-1 text-body-md text-text-heading">
        {v || <span className="text-text-placeholder">—</span>}
      </div>
    </div>
  );
}

export default function AdminDraftPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [draft, setDraft] = useState<AdminDraftDetail | null>(null);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<PreviewFile | null>(null);
  const { clientMenu, candidateMenu } = useAdminSwitchers(
    draft?.owner?.id,
    draft?.id,
  );

  useEffect(() => {
    const id = params?.id;
    if (!id) return;
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
        const d = await adminDraft(token, id);
        if (cancelled) return;
        setDraft(d);
      } catch (err) {
        if (cancelled) return;
        if (
          err instanceof Error &&
          /401|expired|invalid|token/i.test(err.message)
        ) {
          doLogout(router);
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params, router]);

  function handleLogout() {
    doLogout(router);
  }

  if (!user) return <PageLoader />;

  if (error) {
    return (
      <AppShell nav={ADMIN_NAV} user={user} onLogout={handleLogout}>
        <div className="error">{error}</div>
        <Link className="back-link" href="/admin/clients">
          ← Back to clients
        </Link>
      </AppShell>
    );
  }

  if (!draft) return <PageLoader />;

  const d = draft.data;
  const name = (d.name || '').trim() || 'Untitled candidate';
  const docs: DraftDoc[] = Array.isArray(d.idDocuments)
    ? (d.idDocuments as DraftDoc[])
    : [];

  return (
    <AppShell
      nav={ADMIN_NAV}
      user={user}
      onLogout={handleLogout}
      breadcrumbs={[
        { label: 'Home', href: '/admin' },
        { label: 'Clients', href: '/admin/clients' },
        ...(draft.owner
          ? [
              {
                label: draft.owner.name,
                href: `/admin/client/${draft.owner.id}`,
                menu: clientMenu,
              },
            ]
          : []),
        { label: name, menu: candidateMenu },
      ]}
    >
      <button
        type="button"
        onClick={() => router.back()}
        className="mb-4 inline-flex items-center gap-2 text-body-sm text-text-link"
      >
        <ArrowLeft size={16} />
        Back
      </button>

      <header className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-text-heading">{name}</h1>
        <Tag label="Draft" variant="Default" />
        {draft.owner && (
          <span className="text-body-md text-text-placeholder">
            added by {draft.owner.name}
          </span>
        )}
      </header>

      <section className="rounded-xl border border-border-default bg-white p-6">
        <h2 className="mb-5 text-lg font-semibold text-text-heading">
          Candidate details
        </h2>
        <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Name" value={d.name} />
          <Field label="Email" value={d.email} />
          <Field label="Phone" value={d.phone} />
          <Field label="Role" value={d.role} />
          <Field label="Gender" value={d.gender} />
          <Field label="Father's name" value={d.fatherName} />
          <Field label="Date of birth" value={d.dob} />
          <Field label="Pincode" value={d.pincode} />
          <div className="sm:col-span-2 lg:col-span-4">
            <Field label="Permanent address" value={d.permanentAddress} />
          </div>
          <Field label="PAN number" value={d.pan} />
          <Field label="Aadhaar number" value={d.aadhaar} />
          <Field label="Driving licence" value={d.drivingLicense} />
          <Field label="Voter ID" value={d.voterId} />
          <Field label="Passport file no." value={d.passportFileNo} />
          <Field label="UAN" value={d.uan} />
        </div>

        <div className="mt-6 border-t border-border-default pt-5">
          <div className="mb-3 text-base font-semibold text-text-heading">
            Documents
          </div>
          {docs.length === 0 ? (
            <span className="text-text-placeholder">— None uploaded</span>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {docs.map((doc, i) => {
                const dname = doc.name || `Document ${i + 1}`;
                const inner = (
                  <>
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <FileTypeIcon filename={dname} />
                      <span
                        className="min-w-0 flex-1 truncate text-body-sm font-medium text-text-body"
                        title={dname}
                      >
                        {dname}
                      </span>
                    </div>
                    <Eye size={16} className="shrink-0 text-icon-default" />
                  </>
                );
                return doc.url ? (
                  <button
                    key={i}
                    type="button"
                    onClick={() =>
                      setPreview({
                        url: doc.url as string,
                        name: dname,
                        contentType: doc.contentType,
                      })
                    }
                    className="flex items-center justify-between gap-3 rounded-lg border border-border-default bg-neutral-200 px-3.5 py-3 text-left transition-colors hover:bg-neutral-300"
                  >
                    {inner}
                  </button>
                ) : (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border-default bg-neutral-200 px-3.5 py-3"
                  >
                    {inner}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <p className="mt-4 text-body-sm text-text-placeholder">
        This candidate is still a draft — the client hasn&apos;t paid yet, so no
        verification report exists. Reports and downloads appear here once the
        candidate is submitted.
      </p>

      {preview && (
        <FilePreviewModal file={preview} onClose={() => setPreview(null)} />
      )}
    </AppShell>
  );
}
