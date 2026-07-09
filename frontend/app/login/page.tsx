'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { fetchCsrf, login } from '../lib/api';
import { saveSession } from '../lib/session';
import { Eye, EyeOff } from 'lucide-react';
import { IconApple, IconGoogle } from '../components/AuthIcons';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await fetchCsrf();                        // get CSRF cookie before mutation
      const { user } = await login(email, password);
      saveSession('', user);                    // token lives in httpOnly cookie
      router.push(
        user.role === 'admin'
          ? '/admin'
          : user.role === 'candidate'
            ? '/candidate'
            : '/home',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  function handleSocial() {
    setError('Social sign-in is coming soon — please use your email for now.');
  }

  function handleForgot() {
    router.push('/forgot-password');
  }

  return (
    <div className="au">
      <div className="au-card">
        <div className="au-head">
          <h1 className="au-title">Welcome Back</h1>
          <p className="au-sub">Sign in to your Assurio account</p>
        </div>

        <div className="au-toggle">
          <Link href="/login" className="is-active">
            Login
          </Link>
          <Link href="/signup">Register</Link>
        </div>

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
                placeholder="Enter your password"
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

          <button type="button" className="au-forgot" onClick={handleForgot}>
            Forgot Password?
          </button>

          <button className="au-btn" type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Login'}
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

        <p className="au-bottom">
          Don&apos;t have an account? <Link href="/signup">Sign Up</Link>
        </p>
      </div>
    </div>
  );
}
