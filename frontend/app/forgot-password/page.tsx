'use client';

import { useState } from 'react';
import Link from 'next/link';
import { forgotPassword } from '../lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="au">
      <div className="au-card">
        <div className="au-head">
          <h1 className="au-title">Reset password</h1>
          <p className="au-sub">
            Enter your email and we&apos;ll send you a reset link.
          </p>
        </div>

        {sent ? (
          <>
            <div
              className="au-error"
              style={{
                background: '#e8f4ec',
                borderColor: '#bfe0c9',
                color: '#0b6a3b',
              }}
            >
              If an account exists for <strong>{email}</strong>, a reset email
              has been sent. Check your inbox.
            </div>
            <Link href="/login" className="au-bottom" style={{ display: 'block' }}>
              Back to login
            </Link>
          </>
        ) : (
          <>
            {error && <div className="au-error">{error}</div>}
            <form onSubmit={handleSubmit}>
              <div className="au-field">
                <label className="au-label" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  className="au-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>
              <button className="au-btn" type="submit" disabled={loading}>
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
            <p className="au-bottom">
              Remembered it? <Link href="/login">Log in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
