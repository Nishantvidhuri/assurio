'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import {
  adminPatchSubject,
  adminSubject,
  crimeCheck,
  crimeCheckReport,
  me,
  type AdminSubjectDetail,
  type AuthUser,
  type VerificationLogEntry,
} from '../../../lib/api';
import { getToken } from '../../../lib/session';
import { doLogout } from '../../../lib/logout';
import { ICONS, type SidebarItem } from '../../../components/Sidebar';
import AppShell from '../../../components/AppShell';

const ADMIN_NAV: SidebarItem[] = [
  { href: '/admin', label: 'Dashboard', icon: ICONS.dashboard },
  { href: '/admin/clients', label: 'Clients', icon: ICONS.clients },
  { href: '/admin/invoices', label: 'Invoices', icon: ICONS.invoices },
  { href: '/admin/operations', label: 'Operations', icon: ICONS.operations },
  { href: '/admin/vendors', label: 'Vendors', icon: ICONS.vendors },
  { href: '/admin/test-verification', label: 'Test Verification', icon: ICONS.testVerification },
];

interface CrimeCase {
  slNo?: number;
  caseTypeName?: string;
  caseType?: string;
  firNumber?: string;
  courtName?: string;
  state?: string;
  district?: string;
  section?: string;
  underAct?: string;
  caseStatus?: string;
  severity?: string;
  riskType?: string;
  riskSummary?: string;
  judgementSummary?: string;
}

function val(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}

function Row({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="detail-row">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{val(value)}</span>
    </div>
  );
}

export default function AdminSubjectPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [subject, setSubject] = useState<AdminSubjectDetail | null>(null);
  const [error, setError] = useState('');
  const [crimeStarting, setCrimeStarting] = useState(false);
  const [crimeError, setCrimeError] = useState('');
  const crimePollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        const s = await adminSubject(token, id);
        if (cancelled) return;
        setSubject(s);
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
  }, [params, router]);

  useEffect(() => {
    const id = params?.id;
    if (!id || !user) return;
    const token = getToken();
    if (!token) return;
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const es = new EventSource(`${API_URL}/subjects/${id}/events`, { withCredentials: true });
    es.onmessage = (e: MessageEvent) => {
      try { setSubject(JSON.parse(e.data as string)); } catch { /* ignore */ }
    };
    return () => es.close();
  }, [params, user]);

  async function startCrimeCheck() {
    if (!subject) return;
    setCrimeError('');
    setCrimeStarting(true);
    try {
      const token = getToken();
      if (!token) throw new Error('Session expired.');
      const pan = (subject.panResult || {}) as Record<string, unknown>;
      const resp = await crimeCheck(token, {
        name: subject.name,
        panNumber: (subject.panNumber || (pan.pan_number as string | undefined)) ?? undefined,
        dob: (pan.dob as string | undefined) ?? undefined,
      });
      const requestId = (resp as Record<string, unknown>).request_id as string | undefined;
      if (!requestId) throw new Error('No request ID returned from crime check.');
      const updated = await adminPatchSubject(token, subject.id, { crimeRequestId: requestId });
      setSubject(updated);
      pollCrimeResult(token, subject.id, requestId);
    } catch (err) {
      setCrimeError(err instanceof Error ? err.message : 'Crime check failed.');
    } finally {
      setCrimeStarting(false);
    }
  }

  function pollCrimeResult(token: string, subjectId: string, requestId: string) {
    if (crimePollingRef.current) clearTimeout(crimePollingRef.current);
    const tick = async () => {
      try {
        const report = await crimeCheckReport(token, requestId);
        const status = (report as Record<string, unknown>).status as string | undefined;
        if (status === 'completed' || status === 'done' || (report as Record<string, unknown>).data) {
          const updated = await adminPatchSubject(token, subjectId, { crimeResult: { data: report } });
          setSubject(updated);
        } else {
          crimePollingRef.current = setTimeout(tick, 5_000);
        }
      } catch {
        crimePollingRef.current = setTimeout(tick, 8_000);
      }
    };
    crimePollingRef.current = setTimeout(tick, 4_000);
  }

  useEffect(() => () => { if (crimePollingRef.current) clearTimeout(crimePollingRef.current); }, []);

  function handleLogout() {
    doLogout(router);
  }

  if (!user) {
    return <div className="loading">Loading...</div>;
  }

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

  if (!subject) {
    return <div className="loading">Loading...</div>;
  }

  const pan = (subject.panResult || {}) as Record<string, unknown>;
  const panAddr = (pan.address || {}) as Record<string, unknown>;
  const aadhaar = (subject.aadhaarResult || {}) as Record<string, unknown>;
  const aadhaarAddr = (aadhaar.address || {}) as Record<string, unknown>;
  const crime = (subject.crimeResult as { data?: Record<string, unknown> } | null)
    ?.data;
  const risk = (crime?.risk_assessment || {}) as Record<string, unknown>;
  const cases = (crime?.cases || []) as CrimeCase[];

  return (
    <AppShell nav={ADMIN_NAV} user={user} onLogout={handleLogout}>
        <Link className="back-link" href="/admin/clients">
          ← All clients
        </Link>

        <div className="subject-head">
          <div className="result-avatar subject-head-avatar">
            {(subject.name || '?').charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="page-title">{subject.name}</h1>
            <p className="page-sub subject-head-role">
              {subject.role || 'Person'} · added by {subject.ownerName}
            </p>
          </div>
        </div>

        <section className="result-card">
          <div className="detail-group">
            <div className="detail-group-title">Contact &amp; status</div>
            <Row label="Email" value={subject.email} />
            <Row label="Phone" value={subject.phone} />
            <Row label="Status" value={subject.status} />
            <Row label="Added by" value={`${subject.ownerName} (${subject.ownerEmail})`} />
          </div>
        </section>

        {(subject.panFront || subject.panBack) && (
          <section className="result-card" style={{ marginTop: 16 }}>
            <div className="detail-group">
              <div className="detail-group-title">PAN card images</div>
              <div className="adm-pan-images">
                {subject.panFront && (
                  <img className="adm-pan-img" src={subject.panFront} alt="PAN front" />
                )}
                {subject.panBack && (
                  <img className="adm-pan-img" src={subject.panBack} alt="PAN back" />
                )}
              </div>
            </div>
          </section>
        )}

        <VerificationLogSection log={subject.verificationLog ?? []} />

        {(subject.panResult || subject.panNumber) && (
          <section className="result-card" style={{ marginTop: 16 }}>
            <div className="detail-group">
              <div className="detail-group-title">PAN verification</div>
              {subject.panResult ? (
                <>
                  <Row label="PAN number" value={pan.pan_number} />
                  <Row label="Full name" value={pan.full_name} />
                  <Row label="Date of birth" value={pan.dob} />
                  <Row label="Address" value={panAddr.full} />
                  <Row label="Status" value="Verified" />
                </>
              ) : (
                <>
                  <Row label="PAN number" value={subject.panNumber} />
                  <Row label="Status" value="Pending verification" />
                </>
              )}
            </div>
          </section>
        )}

        {subject.aadhaarResult && (
          <section className="result-card" style={{ marginTop: 16 }}>
            <div className="detail-group">
              <div className="detail-group-title">Aadhaar verification</div>
              <Row label="Name" value={aadhaar.name} />
              <Row label="UID" value={aadhaar.uidMasked} />
              <Row label="Date of birth" value={aadhaar.dob} />
              <Row label="Gender" value={aadhaar.gender} />
              <Row
                label="Address"
                value={[
                  aadhaarAddr.house,
                  aadhaarAddr.locality,
                  aadhaarAddr.district,
                  aadhaarAddr.state,
                  aadhaarAddr.pincode,
                ]
                  .filter(Boolean)
                  .join(', ')}
              />
            </div>
          </section>
        )}

        <section className="result-card" style={{ marginTop: 16 }}>
          <div className="detail-group">
            <div className="detail-group-title">Crime check</div>
            {crime ? (
              <>
                <Row label="Risk" value={risk.risk_type} />
                <Row label="Cases found" value={risk.number_of_cases} />
                <Row label="Summary" value={risk.risk_summary} />
              </>
            ) : subject.crimeRequestId ? (
              <Row label="Status" value="Running — polling for results…" />
            ) : (
              <div style={{ padding: '8px 0' }}>
                <button
                  className="vf-btn vf-btn-ghost"
                  onClick={startCrimeCheck}
                  disabled={crimeStarting}
                  style={{ fontSize: 13 }}
                >
                  {crimeStarting ? 'Starting…' : 'Start Crime Check'}
                </button>
                {crimeError && (
                  <div className="vf-error" style={{ marginTop: 8 }}>{crimeError}</div>
                )}
              </div>
            )}
          </div>
          {crime && cases.length > 0 && (
            <div className="detail-group">
              <div className="detail-group-title">Cases</div>
              {cases.map((c, i) => (
                <div key={i} className="adm-case">
                  <div className="adm-case-title">
                    Case {c.slNo ?? i + 1}
                    {c.severity ? ` · ${c.severity}` : ''}
                    {c.riskType ? ` · ${c.riskType}` : ''}
                  </div>
                  <Row label="Court" value={c.courtName} />
                  <Row
                    label="Location"
                    value={[c.district, c.state].filter(Boolean).join(', ')}
                  />
                  <Row label="Sections" value={c.section} />
                  <Row label="Status" value={c.caseStatus} />
                </div>
              ))}
            </div>
          )}
        </section>
      </AppShell>
  );
}

const TYPE_LABEL: Record<string, string> = { pan: 'PAN', aadhaar: 'Aadhaar', crime: 'Crime' };
const TYPE_COLOR: Record<string, string> = { pan: '#1a5276', aadhaar: '#145a32', crime: '#6e2f1a' };
const TYPE_PRICE: Record<string, number> = { pan: 2.64, aadhaar: 3.25, crime: 100 };

function fmt(n: number) {
  return '₹' + n.toFixed(2);
}

function VerificationLogSection({ log }: { log: VerificationLogEntry[] }) {
  const [open, setOpen] = useState<number | null>(null);

  const counts = log.reduce<Record<string, number>>((acc, e) => {
    acc[e.type] = (acc[e.type] || 0) + 1;
    return acc;
  }, {});
  const total = Object.entries(counts).reduce(
    (sum, [type, n]) => sum + n * (TYPE_PRICE[type] || 0),
    0,
  );

  return (
    <section className="result-card" style={{ marginTop: 16 }}>
      <div className="detail-group">
        <div className="detail-group-title">API usage &amp; cost</div>

        {/* Cost summary tiles */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, margin: '10px 0 16px' }}>
          {(['pan', 'aadhaar', 'crime'] as const).map((type) => {
            const n = counts[type] || 0;
            const cost = n * TYPE_PRICE[type];
            return (
              <div key={type} style={{
                flex: '1 1 120px', minWidth: 120,
                border: '1px solid #e8e0d0', borderRadius: 10,
                padding: '10px 14px', background: '#faf7f2',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                    color: '#fff', background: TYPE_COLOR[type],
                    padding: '2px 7px', borderRadius: 999,
                  }}>
                    {TYPE_LABEL[type]}
                  </span>
                  <span style={{ fontSize: 11, color: '#7a6e60' }}>{fmt(TYPE_PRICE[type])} / call</span>
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', lineHeight: 1.1 }}>{n}</div>
                <div style={{ fontSize: 12, color: '#7a6e60', marginTop: 2 }}>
                  {n === 1 ? 'call' : 'calls'} · {fmt(cost)}
                </div>
              </div>
            );
          })}
          <div style={{
            flex: '1 1 120px', minWidth: 120,
            border: '1.5px solid #c9bfa8', borderRadius: 10,
            padding: '10px 14px', background: '#f6f7f9',
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#5a4e3a', marginBottom: 6, letterSpacing: '0.04em' }}>
              TOTAL COST
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', lineHeight: 1.1 }}>{fmt(total)}</div>
            <div style={{ fontSize: 12, color: '#7a6e60', marginTop: 2 }}>{log.length} total calls</div>
          </div>
        </div>

        {/* Call log */}
        {log.length > 0 && (
          <>
            <div className="detail-group-title" style={{ marginBottom: 8 }}>
              Call history ({log.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[...log].reverse().map((entry, i) => {
                const idx = log.length - 1 - i;
                const isOpen = open === idx;
                const ts = new Date(entry.calledAt).toLocaleString('en-IN', {
                  day: '2-digit', month: 'short', year: 'numeric',
                  hour: 'numeric', minute: '2-digit', hour12: true,
                });
                return (
                  <div key={idx} style={{ border: '1px solid #e8e0d0', borderRadius: 8, overflow: 'hidden' }}>
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? null : idx)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                        padding: '9px 14px', background: isOpen ? '#f5f0e8' : '#faf7f2',
                        border: 'none', cursor: 'pointer', textAlign: 'left',
                      }}
                    >
                      <span style={{
                        fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                        color: '#fff', background: TYPE_COLOR[entry.type] || '#555',
                        padding: '2px 7px', borderRadius: 999,
                      }}>
                        {TYPE_LABEL[entry.type] || entry.type.toUpperCase()}
                      </span>
                      <span style={{ flex: 1, fontSize: 13, color: '#3a3228' }}>
                        Call #{log.length - i}
                      </span>
                      <span style={{ fontSize: 12, color: '#7a6e60' }}>{fmt(TYPE_PRICE[entry.type] || 0)}</span>
                      <span style={{ fontSize: 12, color: '#9a8e80', marginLeft: 8 }}>{ts}</span>
                      <ChevronDown
                        size={15}
                        style={{
                          color: '#9a8e80',
                          marginLeft: 6,
                          flexShrink: 0,
                          transition: 'transform 0.18s ease',
                          transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        }}
                      />
                    </button>
                    {isOpen && (
                      <pre style={{
                        margin: 0, padding: '12px 14px',
                        background: '#0f172a', color: '#e0e7ff',
                        fontSize: 11.5, lineHeight: 1.6, overflowX: 'auto',
                        borderTop: '1px solid #e8e0d0',
                      }}>
                        {JSON.stringify(entry.result, null, 2)}
                      </pre>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
