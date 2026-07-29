'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  adminQueueHealth,
  me,
  type AuthUser,
  type QueueHealth,
  type QueueStat,
  type QueueJob,
  type OutboxStats,
  type OutboxEvent,
} from '../../lib/api';
import { getToken } from '../../lib/session';
import { doLogout } from '../../lib/logout';
import Sidebar, { ICONS, type SidebarItem } from '../../components/Sidebar';

// Bull Board is proxied through Next.js rewrites — same port as the app.
const BULL_BOARD_URL = '/admin/queues';

const ADMIN_NAV: SidebarItem[] = [
  { href: '/admin', label: 'Dashboard', icon: ICONS.dashboard },
  { href: '/admin/clients', label: 'Clients', icon: ICONS.clients },
  { href: '/admin/invoices', label: 'Invoices', icon: ICONS.invoices },
  { href: '/admin/operations', label: 'Operations', icon: ICONS.operations },
];

function fmtDate(val: string | number | null): string {
  if (val === null || val === undefined) return '—';
  const d = typeof val === 'number' ? new Date(val) : new Date(val);
  if (isNaN(d.getTime())) return String(val);
  return d.toLocaleString();
}

function healthClass(h: QueueStat['health']): string {
  if (h === 'HEALTHY') return 'ops-badge-healthy';
  if (h === 'DEGRADED') return 'ops-badge-degraded';
  return 'ops-badge-critical';
}

function statusClass(s: string): string {
  const lower = s.toLowerCase();
  if (lower === 'completed') return 'ops-badge-healthy';
  if (lower === 'failed') return 'ops-badge-critical';
  if (lower === 'active') return 'ops-badge-active';
  return 'ops-badge-waiting';
}

export default function OperationsPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [data, setData] = useState<QueueHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await adminQueueHealth();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load queue health');
    } finally {
      setLoading(false);
    }
  }, []);

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
        await fetchData();
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
  }, [router, fetchData]);

  function handleLogout() {
    doLogout(router);
  }

  if (!user) return <div className="loading">Loading...</div>;

  return (
    <div className="shell">
      <Sidebar items={ADMIN_NAV} user={user} onLogout={handleLogout} />
      <main className="shell-main ops-page">
        {/* Header */}
        <div className="ops-header">
          <div className="ops-breadcrumb">Operations</div>
          <h1 className="ops-title">Platform Operations</h1>
          <p className="ops-desc">Queue health, alerts, and reconciliation</p>
        </div>

        {/* Action bar */}
        <div className="ops-action-bar">
          <button
            className="ops-btn ops-btn-primary"
            onClick={fetchData}
            disabled={loading}
          >
            {loading ? <span className="ops-spinner" /> : null}
            Refresh
          </button>
          <a
            className="ops-btn ops-btn-secondary"
            href={BULL_BOARD_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open BullMQ Dashboard
          </a>
        </div>

        {error && <div className="error ops-error">{error}</div>}

        {data && (
          <>
            {/* Meta strip */}
            <div className="ops-meta-strip">
              <span>Generated: {fmtDate(data.generatedAt)}</span>
              <span className="ops-meta-sep" />
              <span>Dead-job threshold: {data.thresholds.deadJob}</span>
              <span className="ops-meta-sep" />
              <span>Backlog threshold: {data.thresholds.backlogSec}s</span>
            </div>

            {/* Outbox stats */}
            <div className="ops-outbox-cards">
              {(
                [
                  { label: 'Pending',    key: 'pending',    cls: 'ops-outbox-pending'    },
                  { label: 'Processing', key: 'processing', cls: 'ops-outbox-processing' },
                  { label: 'Sent',       key: 'sent',       cls: 'ops-outbox-sent'       },
                  { label: 'Failed',     key: 'failed',     cls: 'ops-outbox-failed'     },
                ] as { label: string; key: keyof OutboxStats; cls: string }[]
              ).map(({ label, key, cls }) => (
                <div key={key} className={`ops-outbox-card ${cls}`}>
                  <span className="ops-outbox-count">{data.outboxStats?.[key] ?? 0}</span>
                  <span className="ops-outbox-label">Outbox · {label}</span>
                </div>
              ))}
            </div>

            {/* Queue health table */}
            <section className="ops-section">
              <h2 className="ops-section-title">Queue Health</h2>
              <div className="ops-table-wrap">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>Queue</th>
                      <th>Health</th>
                      <th>Waiting</th>
                      <th>Active</th>
                      <th>Delayed</th>
                      <th>Failed</th>
                      <th>Paused</th>
                      <th>Oldest waiting</th>
                      <th>Oldest failed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.queues.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="ops-empty">No queues found</td>
                      </tr>
                    ) : (
                      data.queues.map((q: QueueStat) => (
                        <tr key={q.name}>
                          <td className="ops-queue-name">
                            <span>{q.label}</span>
                            <span className="ops-queue-id">{q.name}</span>
                          </td>
                          <td>
                            <span className={`ops-badge ${healthClass(q.health)}`}>
                              {q.health}
                            </span>
                          </td>
                          <td>{q.waiting}</td>
                          <td>{q.active}</td>
                          <td>{q.delayed}</td>
                          <td>{q.failed}</td>
                          <td>{q.paused}</td>
                          <td className="ops-ts">{q.oldestWaiting ? fmtDate(q.oldestWaiting) : '—'}</td>
                          <td className="ops-ts">{q.oldestFailed ? fmtDate(q.oldestFailed) : '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Recent jobs table */}
            <section className="ops-section">
              <h2 className="ops-section-title">Recent Jobs</h2>
              <div className="ops-table-wrap">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>Queue</th>
                      <th>Job</th>
                      <th>Status</th>
                      <th>Progress</th>
                      <th>Attempts</th>
                      <th>Queued</th>
                      <th>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentJobs.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="ops-empty">No recent jobs</td>
                      </tr>
                    ) : (
                      data.recentJobs.map((job: QueueJob, idx: number) => (
                        <tr key={idx}>
                          <td>{job.queue}</td>
                          <td>{job.name}</td>
                          <td>
                            <span className={`ops-badge ${statusClass(job.status)}`}>
                              {job.status}
                            </span>
                          </td>
                          <td>{job.progress}%</td>
                          <td>{job.attempts}</td>
                          <td className="ops-ts">{fmtDate(job.timestamp)}</td>
                          <td className="ops-msg">{job.failedReason || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Outbox events */}
            <section className="ops-section">
              <h2 className="ops-section-title">Outbox Events</h2>
              <div className="ops-table-wrap">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Target</th>
                      <th>Attempts</th>
                      <th>Created</th>
                      <th>Processed</th>
                      <th>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.recentOutboxEvents ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={7} className="ops-empty">No outbox events yet</td>
                      </tr>
                    ) : (
                      (data.recentOutboxEvents ?? []).map((ev: OutboxEvent) => (
                        <tr key={ev.id}>
                          <td className="ops-outbox-type">{ev.eventType}</td>
                          <td>
                            <span className={`ops-badge ${statusClass(ev.status)}`}>
                              {ev.status}
                            </span>
                          </td>
                          <td className="ops-outbox-target">{ev.target}</td>
                          <td>{ev.attempts}/{ev.maxAttempts}</td>
                          <td className="ops-ts">{fmtDate(ev.createdAt)}</td>
                          <td className="ops-ts">{ev.processedAt ? fmtDate(ev.processedAt) : '—'}</td>
                          <td className="ops-msg">{ev.lastError || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
