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
import Brand from '../../components/Brand';
import {
  Button,
  Callout,
  Input,
  InputFieldWrapper,
  Loader,
} from '@/shared/components/ui';

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
      <div className="min-h-screen flex items-center justify-center bg-surface-shell px-4 py-10">
        <div className="w-full max-w-md rounded-xl border border-border-default bg-white p-8 shadow-[0px_1px_5px_0px_rgba(11,26,59,0.06)]">
          <div className="mb-6 flex justify-center [&_.brand]:mb-0">
            <Brand />
          </div>
          <div className="mb-6 text-center">
            <h1 className="text-xl font-semibold text-text-heading">Invite issue</h1>
            <p className="mt-1 text-sm text-text-subheading">{loadError}</p>
          </div>
          <p className="text-center text-sm">
            <Link href="/login" className="font-medium text-text-link hover:underline">
              Go to login
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
    <div className="min-h-screen flex items-start justify-center bg-surface-shell px-4 py-10">
      <div className="w-full max-w-[560px] rounded-xl border border-border-default bg-white p-8 shadow-[0px_1px_5px_0px_rgba(11,26,59,0.06)]">
        <div className="mb-6 flex justify-center [&_.brand]:mb-0">
          <Brand />
        </div>

        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-text-heading">
            Welcome, {info.name.split(' ')[0]}
          </h1>
          <p className="mt-1 text-sm text-text-subheading">
            Before setting your password, please read and accept our Terms &amp; Conditions.
          </p>
        </div>

        {/* T&C */}
        <div className="mb-5">
          <TermsBox agreed={tcAgreed} onAgreedChange={setTcAgreed} />
        </div>

        {/* Password form */}
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
          <InputFieldWrapper label="Email" disabled>
            <Input id="invite-email" value={info.email} disabled />
          </InputFieldWrapper>

          <InputFieldWrapper label="Password">
            <Input
              id="invite-password"
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
                  aria-label={showPw ? 'Hide' : 'Show'}
                >
                  {showPw ? <Eye size={16} strokeWidth={1.7} /> : <EyeOff size={16} strokeWidth={1.7} />}
                </button>
              }
            />
          </InputFieldWrapper>

          <InputFieldWrapper label="Confirm password">
            <Input
              id="invite-confirm"
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
                  aria-label={showConfirm ? 'Hide' : 'Show'}
                >
                  {showConfirm ? <Eye size={16} strokeWidth={1.7} /> : <EyeOff size={16} strokeWidth={1.7} />}
                </button>
              }
            />
          </InputFieldWrapper>

          <Button
            type="submit"
            variant="primary"
            isLoading={loading}
            disabled={loading || !tcAgreed}
            className="w-full"
          >
            {loading ? 'Setting password…' : 'I Agree & Continue'}
          </Button>

          {!tcAgreed && (
            <p className="-mt-2 text-center text-xs text-text-subheading">
              You must agree to the Terms &amp; Conditions to proceed.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
