'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  inviteInfo,
  setInvitePassword,
  type CandidateInviteInfo,
} from '../../lib/api';
import { saveSession } from '../../lib/session';
import { Eye, EyeOff } from 'lucide-react';
import TermsBox from '../../components/TermsBox';

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [info, setInfo] = useState<CandidateInviteInfo | null>(null);
  const [loadError, setLoadError] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [tcAgreed, setTcAgreed] = useState(false);

  useEffect(() => {
    const token = params?.token;
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const i = await inviteInfo(token);
        if (cancelled) return;
        setInfo(i);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'Invalid invite link');
      }
    })();
    return () => { cancelled = true; };
  }, [params]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!tcAgreed) { setError('Please agree to the Terms & Conditions to continue.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    const token = params?.token;
    if (!token) return;
    setLoading(true);
    try {
      const { token: accessToken, user } = await setInvitePassword(token, password);
      saveSession(accessToken, user);
      router.push('/candidate');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set password');
    } finally {
      setLoading(false);
    }
  }

  if (loadError) {
    return (
      <div className="au">
        <div className="au-card">
          <div className="au-head">
            <h1 className="au-title">Invite issue</h1>
            <p className="au-sub">{loadError}</p>
          </div>
          <Link href="/login" className="au-bottom" style={{ display: 'block' }}>Go to login</Link>
        </div>
      </div>
    );
  }

  if (!info) return <div className="loading">Loading...</div>;

  return (
    <div className="au" style={{ alignItems: 'flex-start', paddingTop: 40, paddingBottom: 40 }}>
      <div className="au-card" style={{ maxWidth: 560 }}>
        <div className="au-head">
          <h1 className="au-title">Welcome, {info.name.split(' ')[0]}</h1>
          <p className="au-sub">
            Before setting your password, please read and accept our Terms &amp; Conditions.
          </p>
        </div>

        {/* T&C */}
        <div style={{ marginBottom: 20 }}>
          <TermsBox agreed={tcAgreed} onAgreedChange={setTcAgreed} />
        </div>

        {/* Password form */}
        {error && <div className="au-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="au-field">
            <label className="au-label" htmlFor="invite-email">Email</label>
            <input id="invite-email" className="au-input" value={info.email} disabled />
          </div>

          <div className="au-field">
            <label className="au-label" htmlFor="invite-password">Password</label>
            <div className="au-pass">
              <input
                id="invite-password"
                className="au-input"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                required
              />
              <button type="button" className="au-eye" onClick={() => setShowPw(v => !v)} aria-label={showPw ? 'Hide' : 'Show'}>
                {showPw ? <Eye size={18} strokeWidth={1.7} /> : <EyeOff size={18} strokeWidth={1.7} />}
              </button>
            </div>
          </div>

          <div className="au-field">
            <label className="au-label" htmlFor="invite-confirm">Confirm password</label>
            <div className="au-pass">
              <input
                id="invite-confirm"
                className="au-input"
                type={showConfirm ? 'text' : 'password'}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Re-enter your password"
                required
              />
              <button type="button" className="au-eye" onClick={() => setShowConfirm(v => !v)} aria-label={showConfirm ? 'Hide' : 'Show'}>
                {showConfirm ? <Eye size={18} strokeWidth={1.7} /> : <EyeOff size={18} strokeWidth={1.7} />}
              </button>
            </div>
          </div>

          <button
            className="au-btn"
            type="submit"
            disabled={loading || !tcAgreed}
            style={{ opacity: !tcAgreed ? 0.5 : 1, cursor: !tcAgreed ? 'not-allowed' : 'pointer' }}
          >
            {loading ? 'Setting password…' : 'I Agree & Continue'}
          </button>

          {!tcAgreed && (
            <p style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--ink-2)', marginTop: 8 }}>
              You must agree to the Terms &amp; Conditions to proceed.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
