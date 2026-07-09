'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  resetPassword,
  resetPasswordInfo,
  type ResetInfo,
} from '../../lib/api';
import { saveSession } from '../../lib/session';
import { Eye, EyeOff } from 'lucide-react';

export default function ResetPasswordPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [info, setInfo] = useState<ResetInfo | null>(null);
  const [loadError, setLoadError] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = params?.token;
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const i = await resetPasswordInfo(token);
        if (cancelled) return;
        setInfo(i);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'Invalid reset link');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    const token = params?.token;
    if (!token) return;
    setLoading(true);
    try {
      const { token: accessToken, user } = await resetPassword(token, password);
      saveSession(accessToken, user);
      router.push(
        user.role === 'admin'
          ? '/admin'
          : user.role === 'candidate'
            ? '/candidate'
            : '/home',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  }

  if (loadError) {
    return (
      <div className="au">
        <div className="au-card">
          <div className="au-head">
            <h1 className="au-title">Reset link issue</h1>
            <p className="au-sub">{loadError}</p>
          </div>
          <Link href="/forgot-password" className="au-bottom" style={{ display: 'block' }}>
            Request a new link
          </Link>
        </div>
      </div>
    );
  }

  if (!info) return <div className="loading">Loading...</div>;

  return (
    <div className="au">
      <div className="au-card">
        <div className="au-head">
          <h1 className="au-title">Choose a new password</h1>
          <p className="au-sub">For {info.email}</p>
        </div>

        {error && <div className="au-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="au-field">
            <label className="au-label" htmlFor="reset-password">
              New password
            </label>
            <div className="au-pass">
              <input
                id="reset-password"
                className="au-input"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                required
              />
              <button
                type="button"
                className="au-eye"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
              >
                {showPw ? <Eye size={18} strokeWidth={1.7} /> : <EyeOff size={18} strokeWidth={1.7} />}
              </button>
            </div>
          </div>

          <div className="au-field">
            <label className="au-label" htmlFor="reset-confirm">
              Confirm password
            </label>
            <div className="au-pass">
              <input
                id="reset-confirm"
                className="au-input"
                type={showConfirm ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Re-enter your password"
                required
              />
              <button
                type="button"
                className="au-eye"
                onClick={() => setShowConfirm((v) => !v)}
                aria-label={showConfirm ? 'Hide password' : 'Show password'}
              >
                {showConfirm ? <Eye size={18} strokeWidth={1.7} /> : <EyeOff size={18} strokeWidth={1.7} />}
              </button>
            </div>
          </div>

          <button className="au-btn" type="submit" disabled={loading}>
            {loading ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  );
}
