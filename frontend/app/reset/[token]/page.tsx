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
import Brand from '../../components/Brand';
import {
  Button,
  Callout,
  Input,
  InputFieldWrapper,
  Loader,
} from '@/shared/components/ui';

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
      <div className="min-h-screen flex items-center justify-center bg-surface-shell px-4 py-10">
        <div className="w-full max-w-md rounded-xl border border-border-default bg-white p-8 shadow-[0px_1px_5px_0px_rgba(11,26,59,0.06)]">
          <div className="mb-6 flex justify-center [&_.brand]:mb-0">
            <Brand />
          </div>
          <div className="mb-6 text-center">
            <h1 className="text-xl font-semibold text-text-heading">Reset link issue</h1>
            <p className="mt-1 text-sm text-text-subheading">{loadError}</p>
          </div>
          <p className="text-center text-sm">
            <Link
              href="/forgot-password"
              className="font-medium text-text-link hover:underline"
            >
              Request a new link
            </Link>
          </p>
        </div>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-shell">
        <Loader description="Loading..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-shell px-4 py-10">
      <div className="w-full max-w-md rounded-xl border border-border-default bg-white p-8 shadow-[0px_1px_5px_0px_rgba(11,26,59,0.06)]">
        <div className="mb-6 flex justify-center [&_.brand]:mb-0">
          <Brand />
        </div>

        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-text-heading">
            Choose a new password
          </h1>
          <p className="mt-1 text-sm text-text-subheading">For {info.email}</p>
        </div>

        {error && (
          <Callout
            state="Error"
            title={error}
            showAction={false}
            showCloseIcon={false}
            multiline
            className="mb-4"
          />
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <InputFieldWrapper label="New password">
            <Input
              id="reset-password"
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              required
              rightIcon={
                <button
                  type="button"
                  className="inline-flex items-center justify-center text-icon-muted transition-colors hover:text-text-body"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <Eye size={16} strokeWidth={1.7} /> : <EyeOff size={16} strokeWidth={1.7} />}
                </button>
              }
            />
          </InputFieldWrapper>

          <InputFieldWrapper label="Confirm password">
            <Input
              id="reset-confirm"
              type={showConfirm ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter your password"
              required
              rightIcon={
                <button
                  type="button"
                  className="inline-flex items-center justify-center text-icon-muted transition-colors hover:text-text-body"
                  onClick={() => setShowConfirm((v) => !v)}
                  aria-label={showConfirm ? 'Hide password' : 'Show password'}
                >
                  {showConfirm ? <Eye size={16} strokeWidth={1.7} /> : <EyeOff size={16} strokeWidth={1.7} />}
                </button>
              }
            />
          </InputFieldWrapper>

          <Button type="submit" variant="primary" isLoading={loading} className="w-full">
            {loading ? 'Updating…' : 'Update password'}
          </Button>
        </form>
      </div>
    </div>
  );
}
