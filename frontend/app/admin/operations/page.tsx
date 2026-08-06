'use client';
import PageLoader from '@/app/components/PageLoader';

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
import { ICONS, type SidebarItem } from '../../components/Sidebar';
import AppShell from '../../components/AppShell';
import StatCard from '../../components/StatCard';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from '@/shared/components/ui';

// Bull Board is proxied through Next.js rewrites — same port as the app.
const BULL_BOARD_URL = '/admin/queues';

const ADMIN_NAV: SidebarItem[] = [
  { href: '/admin', label: 'Dashboard', icon: ICONS.dashboard },
  { href: '/admin/clients', label: 'Clients', icon: ICONS.clients },
  { href: '/admin/invoices', label: 'Invoices', icon: ICONS.invoices },
  { href: '/admin/vendors', label: 'Vendors', icon: ICONS.vendors },
  { href: '/admin/packages', label: 'Packages', icon: ICONS.packages },
  { href: '/admin/operations', label: 'Operations', icon: ICONS.operations },
  { href: '/admin/test-verification', label: 'Test Verification', icon: ICONS.testVerification },
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

  if (!user) return <PageLoader />;

  return (
    <AppShell nav={ADMIN_NAV} user={user} onLogout={handleLogout}>
      <div className="ops-page">
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
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {(
                [
                  { label: 'Pending',    key: 'pending',    tone: 'warning' },
                  { label: 'Processing', key: 'processing', tone: 'neutral' },
                  { label: 'Sent',       key: 'sent',       tone: 'success' },
                  { label: 'Failed',     key: 'failed',     tone: 'failure' },
                ] as { label: string; key: keyof OutboxStats; tone: 'warning' | 'neutral' | 'success' | 'failure' }[]
              ).map(({ label, key, tone }) => (
                <StatCard
                  key={key}
                  label={`Outbox · ${label}`}
                  value={data.outboxStats?.[key] ?? 0}
                  chip={(data.outboxStats?.[key] ?? 0) > 0 && (tone === 'failure' || tone === 'warning') ? 'attention' : undefined}
                  chipTone={tone}
                />
              ))}
            </div>

            {/* Queue health table */}
            <section className="ops-section">
              <h2 className="ops-section-title">Queue Health</h2>
              <Table bordered className="bg-white">
                <TableHeader>
                  <TableRow>
                      <TableHeaderCell label="Queue" />
                      <TableHeaderCell label="Health" />
                      <TableHeaderCell label="Waiting" />
                      <TableHeaderCell label="Active" />
                      <TableHeaderCell label="Delayed" />
                      <TableHeaderCell label="Failed" />
                      <TableHeaderCell label="Paused" />
                      <TableHeaderCell label="Oldest waiting" />
                      <TableHeaderCell label="Oldest failed" />
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.queues.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center" value={<span className="text-text-placeholder">No queues found</span>} />
                        </TableRow>
                    ) : (
                      data.queues.map((q: QueueStat) => (
                        <TableRow hoverable key={q.name}>
                          <TableCell value={
                            <div className="flex flex-col">
                              <span>{q.label}</span>
                              <span className="text-body-sm text-text-placeholder">{q.name}</span>
                            </div>
                          } />
                          <TableCell type="status" statusLabel={q.health} statusVariant={q.health === 'HEALTHY' ? 'Success' : q.health === 'DEGRADED' ? 'Warning' : 'Failure'} />
                          <TableCell value={q.waiting} />
                          <TableCell value={q.active} />
                          <TableCell value={q.delayed} />
                          <TableCell value={q.failed} />
                          <TableCell value={q.paused} />
                          <TableCell value={q.oldestWaiting ? fmtDate(q.oldestWaiting) : '—'} />
                          <TableCell value={q.oldestFailed ? fmtDate(q.oldestFailed) : '—'} />
                        </TableRow>
                      ))
                    )}
                </TableBody>
              </Table>
            </section>

            {/* Recent jobs table */}
            <section className="ops-section">
              <h2 className="ops-section-title">Recent Jobs</h2>
              <Table bordered className="bg-white">
                <TableHeader>
                  <TableRow>
                      <TableHeaderCell label="Queue" />
                      <TableHeaderCell label="Job" />
                      <TableHeaderCell label="Status" />
                      <TableHeaderCell label="Progress" />
                      <TableHeaderCell label="Attempts" />
                      <TableHeaderCell label="Queued" />
                      <TableHeaderCell label="Message" />
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.recentJobs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center" value={<span className="text-text-placeholder">No recent jobs</span>} />
                        </TableRow>
                    ) : (
                      data.recentJobs.map((job: QueueJob, idx: number) => (
                        <TableRow hoverable key={idx}>
                          <TableCell value={job.queue} />
                          <TableCell value={job.name} />
                          <TableCell type="status" statusLabel={job.status} statusVariant={job.status === 'completed' ? 'Success' : job.status === 'failed' ? 'Failure' : 'Warning'} />
                          <TableCell value={`${job.progress}%`} />
                          <TableCell value={job.attempts} />
                          <TableCell value={fmtDate(job.timestamp)} />
                          <TableCell value={job.failedReason || '—'} />
                        </TableRow>
                      ))
                    )}
                </TableBody>
              </Table>
            </section>

            {/* Outbox events */}
            <section className="ops-section">
              <h2 className="ops-section-title">Outbox Events</h2>
              <Table bordered className="bg-white">
                <TableHeader>
                  <TableRow>
                      <TableHeaderCell label="Type" />
                      <TableHeaderCell label="Status" />
                      <TableHeaderCell label="Target" />
                      <TableHeaderCell label="Attempts" />
                      <TableHeaderCell label="Created" />
                      <TableHeaderCell label="Processed" />
                      <TableHeaderCell label="Error" />
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {(data.recentOutboxEvents ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center" value={<span className="text-text-placeholder">No outbox events yet</span>} />
                        </TableRow>
                    ) : (
                      (data.recentOutboxEvents ?? []).map((ev: OutboxEvent) => (
                        <TableRow hoverable key={ev.id}>
                          <TableCell value={ev.eventType} />
                          <TableCell type="status" statusLabel={ev.status} statusVariant={ev.status === 'sent' ? 'Success' : ev.status === 'failed' ? 'Failure' : 'Warning'} />
                          <TableCell value={ev.target} />
                          <TableCell value={`${ev.attempts}/${ev.maxAttempts}`} />
                          <TableCell value={fmtDate(ev.createdAt)} />
                          <TableCell value={ev.processedAt ? fmtDate(ev.processedAt) : '—'} />
                          <TableCell value={ev.lastError || '—'} />
                        </TableRow>
                      ))
                    )}
                </TableBody>
              </Table>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
