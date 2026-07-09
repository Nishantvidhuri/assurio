'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { fetchCsrf, signup } from '../lib/api';
import { saveSession } from '../lib/session';
import { Eye, EyeOff } from 'lucide-react';
import { IconApple, IconGoogle } from '../components/AuthIcons';

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await fetchCsrf();
      const { user } = await signup(name.trim(), email, password);
      saveSession('', user);
      router.push('/home');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign up failed');
    } finally {
      setLoading(false);
    }
  }

  function handleSocial() {
    setError('Social sign-in is coming soon — please use your email for now.');
  }

  return (
    <div className="au">
      <div className="au-card">
        <div className="au-head">
          <h1 className="au-title">Create an account</h1>
          <p className="au-sub">
            Already have an account? <Link href="/login">Log in</Link>
          </p>
        </div>

        <div className="au-toggle">
          <Link href="/login">Login</Link>
          <Link href="/signup" className="is-active">
            Register
          </Link>
        </div>

        {error && <div className="au-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="au-field">
            <label className="au-label" htmlFor="name">
              Full Name
            </label>
            <input
              id="name"
              className="au-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              required
            />
          </div>

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

          <div className="au-field">
            <label className="au-label" htmlFor="password">
              Password
            </label>
            <div className="au-pass">
              <input
                id="password"
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
            <label className="au-label" htmlFor="confirm">
              Confirm Password
            </label>
            <div className="au-pass">
              <input
                id="confirm"
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
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <div className="au-or">or continue with</div>

        <div className="au-social">
          <button type="button" className="au-social-btn" onClick={handleSocial}>
            <IconGoogle />
            Google
          </button>
          <button type="button" className="au-social-btn" onClick={handleSocial}>
            <IconApple />
            Apple
          </button>
        </div>
      </div>
    </div>
  );
}
