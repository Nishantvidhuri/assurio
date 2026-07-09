'use client';

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  FileText,
  Hourglass,
  IdCard,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import {
  fetchPdfBlobUrl,
  getSubject,
  me,
  type AadhaarKyc,
  type AuthUser,
  type PanData,
  type Subject,
} from '../../lib/api';
import { getToken } from '../../lib/session';
import { doLogout } from '../../lib/logout';
import Sidebar, { ICONS, type SidebarItem } from '../../components/Sidebar';

const CLIENT_NAV: SidebarItem[] = [
  { href: '/home', label: 'Dashboard', icon: ICONS.dashboard },
  { href: '/home/billing', label: 'Billing', icon: ICONS.billing },
];

interface CrimeCase {
  slNo?: number;
  caseTypeName?: string;
  caseType?: string;
  caseNumber?: string;
  cinNumber?: string;
  firNumber?: string;
  firPoliceStation?: string;
  firDistrict?: string;
  firLink?: string;
  hearingDate?: string;
  caseRegDate?: string;
  filingDate?: string;
  courtName?: string;
  state?: string;
  district?: string;
  underAct?: string;
  section?: string;
  caseStatus?: string;
  riskType?: string;
  riskSummary?: string;
  severity?: string;
  judgementSummary?: string;
  judgementLink?: string;
  petitioner?: string;
  respondent?: string;
  matchSummary?: string;
  caseDetailsLink?: string;
}

interface CrimeReport {
  status?: string;
  request_id?: number | string;
  risk_assessment?: {
    risk_type?: string;
    risk_summary?: string;
    number_of_cases?: number;
  };
  download_link?: string;
  cases?: CrimeCase[];
}

interface PdfPreview {
  url: string;
  title: string;
}

/* ---------- helpers ---------- */

function genderLabel(g?: string | null): string {
  if (g === 'M') return 'Male';
  if (g === 'F') return 'Female';
  return g || '';
}

function capitalize(s?: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

function firstSentence(s?: string): string {
  if (!s) return '';
  return s.split('\n')[0].trim();
}

function formatAddress(a: AadhaarKyc['address']): string {
  if (!a) return '';
  const parts: string[] = [];
  if (a.house) parts.push(a.house);
  if (a.locality) parts.push(a.locality);
  if (a.vtc) parts.push(a.vtc);
  if (a.postOffice) parts.push(a.postOffice);
  if (a.district) parts.push(a.district);
  if (a.state) parts.push(a.state);
  if (a.pincode) parts.push(a.pincode);
  if (a.country) parts.push(a.country);
  return parts.join(', ');
}

function riskClass(risk?: string): string {
  const r = (risk || '').toLowerCase();
  if (r.includes('no risk')) return 'risk-no';
  if (r.includes('low')) return 'risk-low';
  if (r.includes('medium') || r.includes('moderate')) return 'risk-medium';
  if (r.includes('high') || r.includes('serious') || r.includes('critical'))
    return 'risk-high';
  return 'risk-no';
}

function severityClass(severity?: string): string {
  const s = (severity || '').toLowerCase();
  if (s.includes('critical') || s.includes('high')) return 'rp-sev-high';
  if (s.includes('medium') || s.includes('moderate')) return 'rp-sev-medium';
  if (s.includes('low') || s.includes('minor')) return 'rp-sev-low';
  return 'rp-sev-info';
}

function timeAgo(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/* ---------- page ---------- */

export default function SubjectReportPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const subjectId = params?.id;

  const [user, setUser] = useState<AuthUser | null>(null);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [loadError, setLoadError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const mountedRef = useRef(true);

  // initial load
  useEffect(() => {
    mountedRef.current = true;
    if (!subjectId) return;
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
        setUser(u);
        const s = await getSubject(token, subjectId);
        if (cancelled) return;
        setSubject(s);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof Error && /401|expired|invalid/i.test(err.message)) {
          doLogout(router);
        } else {
          setLoadError(err instanceof Error ? err.message : 'Failed to load');
        }
      }
    })();
    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, [subjectId, router]);

  // SSE stream — receives subject updates in real-time while any check is pending.
  useEffect(() => {
    if (!subject || !subjectId) return;
    const allDone =
      Boolean(subject.panResult) &&
      Boolean(subject.aadhaarResult) &&
      Boolean(subject.crimeResult);
    if (allDone) return;

    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const es = new EventSource(`${API_URL}/subjects/${subjectId}/events`, { withCredentials: true });
    es.onmessage = (e: MessageEvent) => {
      try {
        const fresh = JSON.parse(e.data as string);
        if (mountedRef.current) setSubject(fresh);
      } catch { /* ignore malformed */ }
    };
    return () => es.close();
  }, [subject, subjectId]);

  async function refreshNow() {
    if (!subjectId) return;
    setRefreshing(true);
    try {
      const token = getToken();
      if (!token) return;
      const fresh = await getSubject(token, subjectId);
      setSubject(fresh);
    } catch {
      /* swallow */
    } finally {
      setRefreshing(false);
    }
  }

  function handleLogout() {
    doLogout(router);
  }

  if (loadError) {
    return (
      <div className="shell">
        {user && (
          <Sidebar items={CLIENT_NAV} user={user} onLogout={handleLogout} />
        )}
        <main className="shell-main">
          <div className="error">{loadError}</div>
          <Link className="cd-back" href="/home">
            <ArrowLeft size={14} />
            Back to dashboard
          </Link>
        </main>
      </div>
    );
  }

  if (!user || !subject) {
    return <div className="loading">Loading...</div>;
  }

  const pan = subject.panResult as PanData | null;
  const aadhaar = subject.aadhaarResult as AadhaarKyc | null;
  const crime = subject.crimeResult as { data?: CrimeReport } | null;
  const crimeReport: CrimeReport = crime?.data ?? {};
  const crimePending = Boolean(subject.crimeRequestId) && !crime;
  const dlPending = Boolean(subject.digilockerClientId) && !aadhaar;
  const panPending = Boolean(subject.panNumber) && !pan;

  const completed = [pan, aadhaar, crime].filter(Boolean).length;
  const totalChecks = 3;
  const progressPct = Math.round((completed / totalChecks) * 100);

  const overallRisk = crimeReport.risk_assessment?.risk_type || null;
  const caseCount =
    crimeReport.risk_assessment?.number_of_cases ??
    crimeReport.cases?.length ??
    0;

  // List of severities (unique, preserving order) across all cases.
  // Used to show a simple at-a-glance list in the hero card.
  const severityList = (() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const c of crimeReport.cases ?? []) {
      const v = (c.severity || '').trim();
      if (!v) continue;
      const key = v.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      list.push(v);
    }
    return list;
  })();
  const hasSeverityData = severityList.length > 0;

  return (
    <div className="shell">
      <Sidebar items={CLIENT_NAV} user={user} onLogout={handleLogout} />
      <main className="shell-main">
        <Link className="cd-back" href="/home">
          <ArrowLeft size={14} />
          All candidates
        </Link>

        <div className="rp">
          {/* Header */}
          <header className="rp-head">
            <div className="rp-head-id">
              <div className="rp-head-avatar">
                {(subject.name || '?').charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="rp-head-eyebrow">
                  <ShieldCheck size={11} />
                  Verification report
                </div>
                <h1 className="rp-head-name">{subject.name}</h1>
                <div className="rp-head-sub">
                  {subject.role && <span>{subject.role}</span>}
                  {subject.email && (
                    <>
                      <span className="cd-dot">·</span>
                      <span>{subject.email}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <button
              className="rp-refresh"
              onClick={refreshNow}
              disabled={refreshing}
              title="Refresh"
            >
              <RefreshCw
                size={13}
                className={refreshing ? 'rp-refresh-spin' : ''}
              />
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </header>

          {/* Summary glimpse */}
          <section className="rp-summary">
            <div className="rp-summary-hero">
              <div className="rp-summary-hero-label">Overall</div>
              {overallRisk ? (
                <div className="rp-summary-hero-risk">
                  <span
                    className={`rp-risk-pill ${riskClass(overallRisk)}`}
                  >
                    {overallRisk}
                  </span>
                  <div className="rp-summary-hero-sub">
                    {caseCount > 0
                      ? `${caseCount} case${caseCount === 1 ? '' : 's'} found`
                      : 'No cases on record'}
                  </div>
                </div>
              ) : crimePending ? (
                <div className="rp-summary-hero-risk">
                  <span className="rp-risk-pill rp-risk-pending">
                    <Hourglass size={11} />
                    Pending
                  </span>
                  <div className="rp-summary-hero-sub">
                    Crime check is running
                  </div>
                </div>
              ) : (
                <div className="rp-summary-hero-risk">
                  <span className="rp-risk-pill rp-risk-idle">Not started</span>
                  <div className="rp-summary-hero-sub">
                    Awaiting candidate verification
                  </div>
                </div>
              )}

              {hasSeverityData && (
                <div className="rp-sev-strip">
                  <div className="rp-sev-strip-label">Severities found</div>
                  <div className="rp-sev-list">
                    {severityList.map((s) => (
                      <span
                        key={s}
                        className={`rp-sev-tag ${severityClass(s)}`}
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="rp-progress">
                <div className="rp-progress-bar">
                  <span
                    className="rp-progress-fill"
                    style={{ width: progressPct + '%' }}
                  />
                </div>
                <div className="rp-progress-label">
                  {completed} of {totalChecks} verifications complete
                </div>
              </div>
            </div>

            <div className="rp-summary-tiles">
              <CheckTile
                icon={<CreditCard size={15} />}
                label="PAN"
                state={pan ? 'done' : panPending ? 'in-progress' : 'pending'}
                detail={
                  pan
                    ? pan.full_name || pan.pan_number
                    : panPending
                      ? subject.panNumber!
                      : 'Awaiting candidate'
                }
              />
              <CheckTile
                icon={<IdCard size={15} />}
                label="Aadhaar"
                state={
                  aadhaar ? 'done' : dlPending ? 'in-progress' : 'pending'
                }
                detail={
                  aadhaar
                    ? aadhaar.uidMasked || 'Verified'
                    : dlPending
                      ? 'DigiLocker open'
                      : 'Awaiting candidate'
                }
              />
              <CheckTile
                icon={<ShieldAlert size={15} />}
                label="Crime"
                state={crime ? 'done' : crimePending ? 'in-progress' : 'pending'}
                detail={
                  crime
                    ? overallRisk || 'Report ready'
                    : crimePending
                      ? 'Running'
                      : 'Awaiting candidate'
                }
              />
              <CheckTile
                icon={<Clock size={15} />}
                label="Updated"
                state="info"
                detail={timeAgo(subject.updatedAt)}
              />
            </div>
          </section>

          {/* PAN section */}
          <SectionShell
            icon={<CreditCard size={15} />}
            title="PAN verification"
            status={pan ? 'done' : panPending ? 'in-progress' : 'pending'}
          >
            {pan ? (
              <PanReadout pan={pan} />
            ) : panPending ? (
              <PendingTile
                label="PAN verification"
                hint={`PAN ${subject.panNumber} submitted — awaiting verification result.`}
              />
            ) : (
              <PendingTile
                label="PAN verification"
                hint="The candidate hasn't submitted their PAN yet."
              />
            )}
          </SectionShell>

          {/* Aadhaar section */}
          <SectionShell
            icon={<IdCard size={15} />}
            title="Aadhaar (DigiLocker)"
            status={aadhaar ? 'done' : dlPending ? 'in-progress' : 'pending'}
          >
            {aadhaar ? (
              <AadhaarReadout a={aadhaar} />
            ) : (
              <PendingTile
                label="Aadhaar verification"
                hint={
                  dlPending
                    ? 'DigiLocker consent in progress.'
                    : "The candidate hasn't started DigiLocker yet."
                }
              />
            )}
          </SectionShell>

          {/* Crime section */}
          <SectionShell
            icon={<ShieldAlert size={15} />}
            title="Criminal records"
            status={crime ? 'done' : crimePending ? 'in-progress' : 'pending'}
          >
            {crime ? (
              <CrimeReadout
                name={subject.name}
                report={crimeReport}
                requestId={subject.crimeRequestId ?? null}
              />
            ) : (
              <PendingTile
                label="Criminal records check"
                hint={
                  crimePending
                    ? 'Aggregating courts and FIR records.'
                    : 'Will run automatically after Aadhaar verification.'
                }
              />
            )}
          </SectionShell>
        </div>
      </main>
    </div>
  );
}

/* ---------- subcomponents ---------- */

function CheckTile({
  icon,
  label,
  state,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  state: 'done' | 'pending' | 'in-progress' | 'info';
  detail: string;
}) {
  return (
    <div className={`rp-tile rp-tile-${state}`}>
      <div className="rp-tile-head">
        <span className="rp-tile-ico">{icon}</span>
        <span className="rp-tile-label">{label}</span>
        {state === 'done' && (
          <CheckCircle2 size={14} className="rp-tile-state" />
        )}
        {state === 'in-progress' && (
          <Hourglass size={14} className="rp-tile-state" />
        )}
        {state === 'pending' && (
          <AlertTriangle size={14} className="rp-tile-state" />
        )}
      </div>
      <div className="rp-tile-detail">{detail}</div>
    </div>
  );
}

function SectionShell({
  icon,
  title,
  status,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  status: 'done' | 'pending' | 'in-progress';
  children: React.ReactNode;
}) {
  return (
    <section className="rp-section">
      <div className="rp-section-head">
        <div className="rp-section-headline">
          <span className="rp-section-ico">{icon}</span>
          <h2 className="rp-section-title">{title}</h2>
        </div>
        <span className={`rp-section-status rp-section-status-${status}`}>
          {status === 'done' ? (
            <>
              <CheckCircle2 size={11} />
              Complete
            </>
          ) : status === 'in-progress' ? (
            <>
              <Hourglass size={11} />
              In progress
            </>
          ) : (
            <>
              <AlertTriangle size={11} />
              Pending
            </>
          )}
        </span>
      </div>
      <div className="rp-section-body">{children}</div>
    </section>
  );
}

function PendingTile({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="rp-pending">
      <Hourglass size={22} className="rp-pending-ico" />
      <div>
        <div className="rp-pending-title">{label} pending</div>
        <div className="rp-pending-sub">{hint}</div>
      </div>
    </div>
  );
}

function PanReadout({ pan }: { pan: PanData }) {
  return (
    <div className="rp-readout">
      <div className="rp-readout-head">
        <div className="rp-readout-avatar">
          {(pan.full_name || '?').charAt(0).toUpperCase()}
        </div>
        <div className="rp-readout-meta">
          <div className="rp-readout-name">{pan.full_name || 'Unknown'}</div>
          <div className="rp-readout-sub">{pan.pan_number}</div>
        </div>
        <span className="rp-section-status rp-section-status-done">
          <CheckCircle2 size={11} />
          Verified
        </span>
      </div>
      <div className="rp-readout-grid">
        <Field label="Gender" value={genderLabel(pan.gender)} />
        <Field label="Date of birth" value={pan.dob} />
        {pan.email && <Field label="Email" value={pan.email} />}
        {pan.phone_number && <Field label="Phone" value={pan.phone_number} />}
      </div>
    </div>
  );
}

function AadhaarReadout({ a }: { a: AadhaarKyc }) {
  return (
    <div className="rp-readout">
      <div className="rp-readout-head">
        {a.photo ? (
          <img
            className="rp-readout-photo"
            src={`data:image/jpeg;base64,${a.photo}`}
            alt=""
          />
        ) : (
          <div className="rp-readout-avatar">
            {(a.name || '?').charAt(0).toUpperCase()}
          </div>
        )}
        <div className="rp-readout-meta">
          <div className="rp-readout-name">{a.name || 'Unknown'}</div>
          <div className="rp-readout-sub">{a.uidMasked || '—'}</div>
        </div>
        <span className="rp-section-status rp-section-status-done">
          <CheckCircle2 size={11} />
          Verified
        </span>
      </div>
      <div className="rp-readout-grid">
        <Field label="Date of birth" value={a.dob} />
        <Field label="Gender" value={genderLabel(a.gender)} />
      </div>
      {a.address && (
        <div className="rp-readout-block">
          <div className="rp-readout-block-label">Address</div>
          <div className="rp-readout-block-value">
            {formatAddress(a.address) || '—'}
          </div>
        </div>
      )}
    </div>
  );
}

function CrimeReadout({
  name,
  report,
  requestId,
}: {
  name: string;
  report: CrimeReport;
  requestId: string | null;
}) {
  const ra = report.risk_assessment ?? {};
  const cases = report.cases ?? [];
  const [preview, setPreview] = useState<PdfPreview | null>(null);
  const caseCount = ra.number_of_cases ?? cases.length;

  return (
    <div className="rp-readout">
      <div className="rp-readout-head">
        <div className="rp-readout-avatar">
          {(name || '?').charAt(0).toUpperCase()}
        </div>
        <div className="rp-readout-meta">
          <div className="rp-readout-name">{name}</div>
          <div className="rp-readout-sub">
            {requestId ? `Request ${requestId}` : 'Crime check'}
          </div>
        </div>
        {ra.risk_type && (
          <span className={`rp-risk-pill ${riskClass(ra.risk_type)}`}>
            {ra.risk_type}
          </span>
        )}
      </div>

      <div className="rp-crime-bar">
        <div className="rp-crime-stat">
          <div className="rp-crime-stat-n">{caseCount}</div>
          <div className="rp-crime-stat-l">
            {caseCount === 1 ? 'Case found' : 'Cases found'}
          </div>
        </div>
        {report.download_link && (
          <div className="rp-crime-actions">
            <button
              type="button"
              className="rp-crime-pdf"
              onClick={() =>
                setPreview({
                  url: report.download_link as string,
                  title: 'Crime check report',
                })
              }
            >
              <FileText size={13} />
              Preview report
            </button>
            <a
              className="rp-crime-pdf rp-crime-pdf-light"
              href={report.download_link}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Download size={13} />
              Download
            </a>
          </div>
        )}
      </div>

      {ra.risk_summary && (
        <div className="rp-readout-block">
          <div className="rp-readout-block-label">Risk summary</div>
          <div className="rp-readout-block-value">{ra.risk_summary}</div>
        </div>
      )}

      {cases.length > 0 && (
        <div className="rp-cases">
          {cases.map((c, i) => (
            <CrimeCaseCard key={i} c={c} index={i} setPreview={setPreview} />
          ))}
        </div>
      )}

      {preview && (
        <PdfPreviewModal
          url={preview.url}
          title={preview.title}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div className="rp-field">
      <div className="rp-field-label">{label}</div>
      <div className="rp-field-value">{value || '—'}</div>
    </div>
  );
}

function CrimeCaseCard({
  c,
  index,
  setPreview,
}: {
  c: CrimeCase;
  index: number;
  setPreview: Dispatch<SetStateAction<PdfPreview | null>>;
}) {
  const isFir = Boolean(c.firNumber);
  const headLabel = isFir ? 'FIR' : c.caseType || c.caseTypeName || 'Case';
  const location = [c.district, c.state].filter(Boolean).join(', ');

  return (
    <div className="rp-case">
      <div className="rp-case-head">
        <div>
          <div className="rp-case-title">
            Case {c.slNo || index + 1} · {headLabel}
          </div>
          {c.caseStatus && (
            <div className="rp-case-sub">{c.caseStatus}</div>
          )}
        </div>
        <div className="rp-case-head-tags">
          {c.severity && (
            <span className={`rp-sev-chip ${severityClass(c.severity)}`}>
              <AlertTriangle size={11} />
              {c.severity}
            </span>
          )}
          {c.riskType && (
            <span className={`rp-risk-pill rp-risk-pill-sm ${riskClass(c.riskType)}`}>
              {c.riskType}
            </span>
          )}
        </div>
      </div>

      {c.riskSummary && <p className="rp-case-summary">{c.riskSummary}</p>}

      <div className="rp-case-grid">
        {c.severity && <Field label="Severity" value={c.severity} />}
        {c.courtName && <Field label="Court" value={c.courtName} />}
        {location && <Field label="Location" value={location} />}
        {c.caseTypeName && !isFir && <Field label="Type" value={c.caseTypeName} />}
        {c.section && <Field label="Sections" value={c.section} />}
        {c.underAct && <Field label="Under act" value={c.underAct} />}
        {c.caseStatus && <Field label="Status" value={c.caseStatus} />}
        {c.caseRegDate && <Field label="Registered" value={c.caseRegDate} />}
        {c.filingDate && c.filingDate !== c.caseRegDate && (
          <Field label="Filed" value={c.filingDate} />
        )}
        {c.hearingDate && <Field label="Next hearing" value={c.hearingDate} />}
        {c.petitioner && <Field label="Petitioner" value={c.petitioner} />}
        {c.respondent && <Field label="Respondent" value={c.respondent} />}
        {isFir && c.firNumber && <Field label="FIR number" value={c.firNumber} />}
        {isFir && c.firPoliceStation && (
          <Field label="Police station" value={c.firPoliceStation} />
        )}
        {c.matchSummary && (
          <Field label="Match" value={firstSentence(c.matchSummary)} />
        )}
      </div>

      {c.judgementSummary && (
        <div className="rp-readout-block">
          <div className="rp-readout-block-label">Judgement summary</div>
          <div className="rp-readout-block-value">{c.judgementSummary}</div>
        </div>
      )}

      {(c.caseDetailsLink ||
        (c.judgementLink && c.judgementLink !== 'NA') ||
        (c.firLink && c.firLink !== 'NA')) && (
        <div className="rp-case-links">
          {c.caseDetailsLink && (
            <a
              className="rp-case-link"
              href={c.caseDetailsLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              Case details ↗
            </a>
          )}
          {c.judgementLink && c.judgementLink !== 'NA' && (
            <button
              type="button"
              className="rp-case-link"
              onClick={() =>
                setPreview({
                  url: c.judgementLink as string,
                  title: `Case ${c.slNo ?? index + 1} — Judgement`,
                })
              }
            >
              Preview judgement
            </button>
          )}
          {c.firLink && c.firLink !== 'NA' && (
            <button
              type="button"
              className="rp-case-link"
              onClick={() =>
                setPreview({
                  url: c.firLink as string,
                  title: `Case ${c.slNo ?? index + 1} — FIR copy`,
                })
              }
            >
              Preview FIR
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function PdfPreviewModal({
  url,
  title,
  onClose,
}: {
  url: string;
  title: string;
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
        const objectUrl = await fetchPdfBlobUrl(token, url);
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        created = objectUrl;
        setBlobUrl(objectUrl);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load PDF');
        }
      }
    })();
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [url]);

  return (
    <div className="pdf-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="pdf-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="pdf-modal-head">
          <div className="pdf-modal-title">{title}</div>
          <div className="pdf-modal-actions">
            <a
              className="pdf-modal-link"
              href={url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in new tab ↗
            </a>
            <button
              type="button"
              className="pdf-modal-close"
              onClick={onClose}
              aria-label="Close preview"
            >
              ×
            </button>
          </div>
        </header>
        {error ? (
          <div className="pdf-modal-empty">
            <div>Couldn&apos;t load the PDF preview.</div>
            <div className="pdf-modal-empty-sub">{error}</div>
            <a
              className="pdf-modal-link"
              href={url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in a new tab instead ↗
            </a>
          </div>
        ) : !blobUrl ? (
          <div className="pdf-modal-empty">
            <div>Loading PDF…</div>
          </div>
        ) : (
          <iframe className="pdf-modal-frame" src={blobUrl} title={title} />
        )}
      </div>
    </div>
  );
}

