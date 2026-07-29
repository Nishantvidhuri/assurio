'use client';

import { useState } from 'react';
import Link from 'next/link';
import { forgotPassword } from '../lib/api';
import Brand from '../components/Brand';
import {
  Button,
  Callout,
  Input,
  InputFieldWrapper,
} from '@/shared/components/ui';

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
    <div className="min-h-screen flex items-center justify-center bg-[#F4F7FC] px-4 py-10">
      <div className="w-full max-w-md rounded-xl border border-border-default bg-white p-8 shadow-[0px_1px_5px_0px_rgba(11,26,59,0.06)]">
        <div className="mb-6 flex justify-center [&_.brand]:mb-0">
          <Brand />
        </div>

        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-text-heading">Reset password</h1>
          <p className="mt-1 text-sm text-text-subheading">
            Enter your email and we&apos;ll send you a reset link.
          </p>
        </div>

        {sent ? (
          <>
            <Callout
              state="Success"
              title={
                <>
                  If an account exists for <strong>{email}</strong>, a reset
                  email has been sent. Check your inbox.
                </>
              }
              showAction={false}
              showCloseIcon={false}
              multiline
            />
            <p className="mt-6 text-center text-sm">
              <Link href="/login" className="font-medium text-text-link hover:underline">
                Back to login
              </Link>
            </p>
          </>
        ) : (
          <>
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
              <InputFieldWrapper label="Email">
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </InputFieldWrapper>
              <Button type="submit" variant="primary" isLoading={loading} className="w-full">
                {loading ? 'Sending…' : 'Send reset link'}
              </Button>
            </form>
            <p className="mt-6 text-center text-sm text-text-subheading">
              Remembered it?{' '}
              <Link href="/login" className="font-medium text-text-link hover:underline">
                Log in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
