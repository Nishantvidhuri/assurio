'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { me, bulkInvite, bulkStatus, type AuthUser, type BulkCandidate, type BulkBatchStatus } from '../../lib/api';
import { getToken } from '../../lib/session';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from '@/shared/components/ui';

const TEMPLATE_CSV = `name,email,phone,role
Ravi Kumar,ravi@example.com,9876543210,Software Engineer
Priya Sharma,priya@example.com,9123456780,Product Manager`;

const REQUIRED_COLS = ['name', 'email'];

function parseCsv(text: string): { rows: BulkCandidate[]; errors: string[] } {
  const lines = text.trim().split('\n').filter(Boolean);
  if (lines.length < 2) return { rows: [], errors: ['CSV must have a header row and at least one data row'] };

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z]/g, ''));
  const missing = REQUIRED_COLS.filter(c => !headers.includes(c));
  if (missing.length) return { rows: [], errors: [`Missing required columns: ${missing.join(', ')}`] };

  const rows: BulkCandidate[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',').map(v => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, j) => { row[h] = vals[j] || ''; });

    if (!row.name) { errors.push(`Row ${i}: name is empty`); continue; }
    if (!row.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
      errors.push(`Row ${i}: invalid email "${row.email}"`); continue;
    }

    rows.push({
      name: row.name,
      email: row.email,
      phone: row.phone || undefined,
      role: row.role || undefined,
      panNumber: row.pannumber || row.pan || undefined,
      aadhaarNumber: row.aadhaarnumber || row.aadhaar || undefined,
    });
  }

  return { rows, errors };
}

export default function BulkInvitePage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [csvText, setCsvText] = useState('');
  const [preview, setPreview] = useState<BulkCandidate[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [batch, setBatch] = useState<BulkBatchStatus | null>(null);
  const [sending, setSending] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) { router.replace('/login'); return; }
    me(token)
      .then(u => { if (u.role !== 'admin') router.replace('/home'); else setUser(u); })
      .catch(() => router.replace('/login'));
  }, [router]);

  const handleCsvChange = useCallback((text: string) => {
    setCsvText(text);
    setBatchId(null);
    setBatch(null);
    if (!text.trim()) { setPreview([]); setParseErrors([]); return; }
    const { rows, errors } = parseCsv(text);
    setPreview(rows);
    setParseErrors(errors);
  }, []);

  function onFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) readFile(f);
  }

  function readFile(f: File) {
    const reader = new FileReader();
    reader.onload = () => handleCsvChange(reader.result as string);
    reader.readAsText(f);
  }

  async function handleSend() {
    const token = getToken();
    if (!token || !preview.length) return;
    setSending(true);
    try {
      const { batchId: id } = await bulkInvite(token, preview);
      setBatchId(id);
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const es = new EventSource(`${API_URL}/subjects/bulk/${id}/events`, { withCredentials: true });
      esRef.current = es;
      es.onmessage = (e: MessageEvent) => {
        try {
          const status = JSON.parse(e.data as string);
          setBatch(status);
          if (status.status === 'done') {
            es.close();
            esRef.current = null;
            setSending(false);
          }
        } catch { /* ignore */ }
      };
    } catch (err) {
      setSending(false);
      setParseErrors([(err as Error)?.message ?? 'Failed to start batch']);
    }
  }

  useEffect(() => () => { esRef.current?.close(); }, []);

  const pct = batch ? Math.round(((batch.done + batch.failed) / batch.total) * 100) : 0;
  const isDone = batch?.status === 'done';

  if (!user) return null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '48px 16px' }}>
      <div style={{ width: '100%' }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontFamily: 'var(--font-display,sans-serif)', fontSize: 26, fontWeight: 500, color: 'var(--ink)', margin: 0 }}>
            Bulk Invite
          </h1>
          <p style={{ color: 'var(--ink-2)', fontSize: 13.5, marginTop: 6, margin: '6px 0 0' }}>
            Upload a CSV to send verification invites to multiple candidates at once.
            Each invite is queued — no crashes, no rate limits.
          </p>
        </div>

        {/* CSV Drop zone */}
        {!batchId && (
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onFileDrop}
            onClick={() => fileRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? 'var(--ink)' : 'var(--rule)'}`,
              borderRadius: 10, padding: '20px 20px 14px', cursor: 'pointer',
              background: dragOver ? 'var(--paper)' : 'transparent',
              transition: 'all 0.15s', marginBottom: 16,
            }}
          >
            <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) readFile(f); }} />
            <div style={{ textAlign: 'center', marginBottom: 12 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--ink-2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 4 }}>
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                <line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 12 15 15"/>
              </svg>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)' }}>
                Drop a <strong style={{ color: 'var(--ink)' }}>CSV file</strong> or{' '}
                <span style={{ color: 'var(--ink)', textDecoration: 'underline' }}>browse</span>
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--ink-2)' }}>
                Required columns: <code>name</code>, <code>email</code> — optional: <code>phone</code>, <code>role</code>
              </p>
            </div>

            {/* Inline textarea */}
            <textarea
              value={csvText}
              onClick={e => e.stopPropagation()}
              onChange={e => handleCsvChange(e.target.value)}
              placeholder={TEMPLATE_CSV}
              rows={6}
              style={{
                width: '100%', boxSizing: 'border-box', resize: 'vertical',
                border: '1px solid var(--rule)', borderRadius: 6,
                padding: '8px 10px', fontSize: 12, fontFamily: 'monospace',
                color: 'var(--ink)', background: 'var(--card)', outline: 'none',
              }}
            />
          </div>
        )}

        {/* Template download */}
        {!batchId && (
          <div style={{ marginBottom: 20 }}>
            <a
              href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE_CSV)}`}
              download="bulk-invite-template.csv"
              style={{ fontSize: 12.5, color: 'var(--ink-2)', textDecoration: 'underline' }}
            >
              Download template CSV
            </a>
          </div>
        )}

        {/* Parse errors */}
        {parseErrors.length > 0 && (
          <div style={{ background: '#fdf3f3', border: '1px solid #f5c6c6', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
            <p style={{ margin: '0 0 4px', fontSize: 12.5, fontWeight: 600, color: '#dc2626' }}>
              {parseErrors.length} issue{parseErrors.length > 1 ? 's' : ''} found
            </p>
            {parseErrors.map((e, i) => (
              <p key={i} style={{ margin: '2px 0', fontSize: 12, color: '#dc2626' }}>• {e}</p>
            ))}
          </div>
        )}

        {/* Preview table */}
        {preview.length > 0 && !batchId && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 13, color: 'var(--ink-2)', margin: '0 0 8px' }}>
              <strong style={{ color: 'var(--ink)' }}>{preview.length}</strong> candidate{preview.length !== 1 ? 's' : ''} ready to invite
            </p>
            <div>
              <Table bordered className="bg-white">
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell label="#" />
                    <TableHeaderCell label="Name" />
                    <TableHeaderCell label="Email" />
                    <TableHeaderCell label="Phone" />
                    <TableHeaderCell label="Role" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.slice(0, 8).map((c, i) => (
                    <TableRow key={i}>
                      <TableCell value={i + 1} />
                      <TableCell value={<span className="font-medium">{c.name}</span>} />
                      <TableCell value={c.email} />
                      <TableCell value={c.phone || '—'} />
                      <TableCell value={c.role || '—'} />
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {preview.length > 8 && (
                <div style={{ padding: '6px 12px', background: 'var(--paper)', borderTop: '1px solid var(--rule)', fontSize: 12, color: 'var(--ink-2)' }}>
                  +{preview.length - 8} more rows
                </div>
              )}
            </div>
          </div>
        )}

        {/* Send button */}
        {preview.length > 0 && !batchId && (
          <button
            onClick={handleSend}
            disabled={sending || parseErrors.length > 0}
            style={{
              width: '100%', padding: '13px 0', borderRadius: 8, border: 'none',
              background: 'var(--ink)', color: 'var(--paper)', fontSize: 14, fontWeight: 600,
              cursor: parseErrors.length > 0 ? 'not-allowed' : 'pointer',
              opacity: parseErrors.length > 0 ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {sending ? (
              <><span className="wa-demo-spinner" style={{ borderTopColor: 'var(--paper)' }} /> Queuing…</>
            ) : (
              `Send ${preview.length} invite${preview.length !== 1 ? 's' : ''}`
            )}
          </button>
        )}

        {/* Progress */}
        {batchId && (
          <div style={{ border: '1px solid var(--rule)', borderRadius: 12, padding: '24px 24px 20px', background: 'var(--card)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                {isDone ? 'Done' : 'Sending invites…'}
              </span>
              <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                {batch ? `${batch.done + batch.failed} / ${batch.total}` : '0 / …'}
              </span>
            </div>

            {/* Progress bar */}
            <div style={{ height: 6, background: 'var(--rule)', borderRadius: 999, overflow: 'hidden', marginBottom: 14 }}>
              <div style={{
                height: '100%', width: `${pct}%`,
                background: isDone && batch && batch.failed === 0 ? '#059669' : isDone ? '#d97706' : 'var(--ink)',
                borderRadius: 999, transition: 'width 0.4s ease',
              }} />
            </div>

            {batch && (
              <div style={{ display: 'flex', gap: 20, fontSize: 13 }}>
                <span style={{ color: '#059669' }}>✓ {batch.done} sent</span>
                {batch.failed > 0 && <span style={{ color: '#dc2626' }}>✗ {batch.failed} failed</span>}
                {!isDone && <span style={{ color: 'var(--ink-2)' }}>{batch.total - batch.done - batch.failed} queued</span>}
              </div>
            )}

            {batch && batch.failedRows.length > 0 && (
              <div style={{ marginTop: 14, background: '#fdf3f3', border: '1px solid #f5c6c6', borderRadius: 8, padding: '10px 14px' }}>
                <p style={{ margin: '0 0 6px', fontSize: 12.5, fontWeight: 600, color: '#dc2626' }}>Failed rows</p>
                {batch.failedRows.map((e, i) => (
                  <p key={i} style={{ margin: '2px 0', fontSize: 12, color: '#dc2626' }}>
                    Row {e.row + 1} ({e.email}): {e.reason}
                  </p>
                ))}
              </div>
            )}

            {isDone && (
              <button
                onClick={() => { setCsvText(''); setPreview([]); setBatchId(null); setBatch(null); setSending(false); }}
                style={{
                  marginTop: 16, padding: '9px 20px', borderRadius: 7, border: '1px solid var(--rule)',
                  background: 'transparent', color: 'var(--ink)', fontSize: 13, cursor: 'pointer',
                }}
              >
                Upload another batch
              </button>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
