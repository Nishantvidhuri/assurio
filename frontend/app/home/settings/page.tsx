'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Phone, User } from 'lucide-react';
import { me, updateMe, type AuthUser } from '../../lib/api';
import { getToken } from '../../lib/session';
import { doLogout } from '../../lib/logout';
import { CLIENT_NAV } from '../../components/Sidebar';
import AppShell from '../../components/AppShell';
import {
  Button,
  Callout,
  Input,
  InputFieldWrapper,
  Loader,
  Tag,
} from '@/shared/components/ui';


export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = getToken();
    if (!token) { router.replace('/login'); return; }
    me(token).then((u) => {
      if (u.role === 'candidate') { router.replace('/candidate'); return; }
      setUser(u);
      setPhone(u.phone ?? '');
    }).catch(() => {
      doLogout(router);
    });
  }, [router]);

  function logout() {
    doLogout(router);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const updated = await updateMe(token, { phone: phone.trim() });
      setUser(updated);
      setPhone(updated.phone ?? '');
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader description="Loading..." />
      </div>
    );
  }

  return (
    <AppShell nav={CLIENT_NAV} user={user} onLogout={logout}>
        <div className="mx-auto w-full max-w-3xl">

          {/* Page header */}
          <header className="mb-6">
            <h1 className="text-xl font-semibold text-text-heading">Settings</h1>
            <p className="mt-1 text-body-md text-text-subheading">
              Manage your account and notification preferences
            </p>
          </header>

          <div className="flex flex-col gap-4">

            {/* Profile card — read-only info */}
            <section className="rounded-lg border border-border-default bg-white p-5">
              <div className="mb-4 flex items-center gap-2">
                <span className="inline-flex size-8 items-center justify-center rounded-md bg-primary-200 text-primary">
                  <User size={16} strokeWidth={1.8} />
                </span>
                <h2 className="text-body-lg font-bold text-text-heading">Account</h2>
              </div>
              <div className="flex flex-col divide-y divide-border-default">
                <div className="grid grid-cols-[120px_1fr] items-center gap-3 py-2.5">
                  <span className="text-body-sm font-medium text-text-subheading">Name</span>
                  <span className="text-body-md text-text-body">{user.name}</span>
                </div>
                <div className="grid grid-cols-[120px_1fr] items-center gap-3 py-2.5">
                  <span className="text-body-sm font-medium text-text-subheading">Email</span>
                  <span className="text-body-md text-text-body">{user.email}</span>
                </div>
                <div className="grid grid-cols-[120px_1fr] items-center gap-3 py-2.5">
                  <span className="text-body-sm font-medium text-text-subheading">Role</span>
                  <span>
                    <Tag variant="Info" label={user.role ?? 'owner'} />
                  </span>
                </div>
              </div>
            </section>

            {/* Contact card — editable */}
            <section className="rounded-lg border border-border-default bg-white p-5">
              <div className="mb-1 flex items-center gap-2">
                <span className="inline-flex size-8 items-center justify-center rounded-md bg-primary-200 text-primary">
                  <Phone size={16} strokeWidth={1.8} />
                </span>
                <h2 className="text-body-lg font-bold text-text-heading">Contact Number</h2>
              </div>
              <p className="mb-4 text-body-sm text-text-subheading">
                Your mobile number, kept on file for your account.
              </p>

              <form onSubmit={handleSave} className="flex flex-col gap-4">
                <InputFieldWrapper
                  label="Mobile number"
                  note="Enter your 10-digit mobile number."
                >
                  <Input
                    id="st-phone"
                    type="tel"
                    inputMode="numeric"
                    maxLength={15}
                    placeholder="98765 43210"
                    value={phone.replace(/^\+?91/, '')}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                    leftIcon={
                      <span className="text-body-md font-medium text-text-subheading">+91</span>
                    }
                    rightIcon={
                      user.phone ? (
                        <CheckCircle2 size={15} className="text-success" />
                      ) : undefined
                    }
                  />
                </InputFieldWrapper>

                {error && (
                  <Callout
                    state="Error"
                    title={error}
                    showAction={false}
                    showCloseIcon={false}
                    multiline
                  />
                )}
                {saved && (
                  <Callout
                    state="Success"
                    title="Number saved."
                    showAction={false}
                    showCloseIcon={false}
                  />
                )}

                <div className="flex justify-end">
                  <Button type="submit" variant="primary" isLoading={saving}>
                    {saving ? 'Saving…' : 'Save changes'}
                  </Button>
                </div>
              </form>
            </section>

          </div>
        </div>
      </AppShell>
  );
}
