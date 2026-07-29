'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { fetchCsrf, signup } from '../lib/api';
import { saveSession } from '../lib/session';
import { Eye, EyeOff } from 'lucide-react';
import { IconApple, IconGoogle } from '../components/AuthIcons';
import Brand from '../components/Brand';
import {
  Button,
  Callout,
  Input,
  InputFieldWrapper,
  TabBar,
  TabBarItem,
} from '@/shared/components/ui';

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
    <div className="min-h-screen flex items-center justify-center bg-[#F4F7FC] px-4 py-10">
      <div className="w-full max-w-md rounded-xl border border-border-default bg-white p-8 shadow-[0px_1px_5px_0px_rgba(11,26,59,0.06)]">
        <div className="mb-6 flex justify-center [&_.brand]:mb-0">
          <Brand />
        </div>

        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-text-heading">Create an account</h1>
          <p className="mt-1 text-sm text-text-subheading">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-text-link hover:underline">
              Log in
            </Link>
          </p>
        </div>

        <TabBar
          defaultValue="register"
          value="register"
          onValueChange={(v) => {
            if (v === 'login') router.push('/login');
          }}
          className="mb-6 w-full"
        >
          <TabBarItem value="login" className="flex-1">
            Login
          </TabBarItem>
          <TabBarItem value="register" className="flex-1">
            Register
          </TabBarItem>
        </TabBar>

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
          <InputFieldWrapper label="Full Name">
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              required
            />
          </InputFieldWrapper>

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

          <InputFieldWrapper label="Password">
            <Input
              id="password"
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

          <InputFieldWrapper label="Confirm Password">
            <Input
              id="confirm"
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
            {loading ? 'Creating account…' : 'Create account'}
          </Button>
        </form>

        <div className="my-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-border-hover" />
          <span className="text-xs font-medium text-text-subheading">
            or continue with
          </span>
          <span className="h-px flex-1 bg-border-hover" />
        </div>

        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={handleSocial}
            leftIcon={<IconGoogle />}
            className="flex-1"
          >
            Google
          </Button>
          <Button
            variant="secondary"
            onClick={handleSocial}
            leftIcon={<IconApple />}
            className="flex-1"
          >
            Apple
          </Button>
        </div>
      </div>
    </div>
  );
}
