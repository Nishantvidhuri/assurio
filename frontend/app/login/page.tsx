'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { fetchCsrf, login } from '../lib/api';
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
    <div className="min-h-screen flex items-center justify-center bg-[#F4F7FC] px-4 py-10">
      <div className="w-full max-w-md rounded-xl border border-border-default bg-white p-8 shadow-[0px_1px_5px_0px_rgba(11,26,59,0.06)]">
        <div className="mb-6 flex justify-center [&_.brand]:mb-0">
          <Brand />
        </div>

        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-text-heading">Welcome Back</h1>
          <p className="mt-1 text-sm text-text-subheading">
            Sign in to your Assurio account
          </p>
        </div>

        <TabBar
          defaultValue="login"
          value="login"
          onValueChange={(v) => {
            if (v === 'register') router.push('/signup');
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
              placeholder="Enter your password"
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

          <div className="-mt-1 flex justify-end">
            <Button variant="link" onClick={handleForgot}>
              Forgot Password?
            </Button>
          </div>

          <Button type="submit" variant="primary" isLoading={loading} className="w-full">
            {loading ? 'Signing in…' : 'Login'}
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

        <p className="mt-6 text-center text-sm text-text-subheading">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="font-medium text-text-link hover:underline">
            Sign Up
          </Link>
        </p>
      </div>
    </div>
  );
}
