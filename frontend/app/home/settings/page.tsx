'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Phone, Settings, User } from 'lucide-react';
import { me, updateMe, type AuthUser } from '../../lib/api';
import { getToken } from '../../lib/session';
import { doLogout } from '../../lib/logout';
import Sidebar, { ICONS, type SidebarItem } from '../../components/Sidebar';

const CLIENT_NAV: SidebarItem[] = [
  { href: '/home', label: 'Dashboard', icon: ICONS.dashboard },
  { href: '/home/billing', label: 'Billing', icon: ICONS.billing },
  { href: '/home/settings', label: 'Settings', icon: <Settings size={18} strokeWidth={1.7} /> },
];

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
      <div className="st-loading">
        <span className="spinner" />
      </div>
    );
  }

  return (
    <div className="shell">
      <Sidebar items={CLIENT_NAV} user={user} onLogout={logout} />
      <main className="shell-main">
        <div className="st-page">

          {/* Page header */}
          <header className="st-head">
            <h1 className="st-title">Settings</h1>
            <p className="st-sub">Manage your account and notification preferences</p>
          </header>

          <div className="st-grid">

            {/* Profile card — read-only info */}
            <section className="st-card">
              <div className="st-card-header">
                <span className="st-card-icon"><User size={16} strokeWidth={1.8} /></span>
                <h2 className="st-card-title">Account</h2>
              </div>
              <div className="st-rows">
                <div className="st-row">
                  <span className="st-row-label">Name</span>
                  <span className="st-row-val">{user.name}</span>
                </div>
                <div className="st-row">
                  <span className="st-row-label">Email</span>
                  <span className="st-row-val">{user.email}</span>
                </div>
                <div className="st-row">
                  <span className="st-row-label">Role</span>
                  <span className="st-row-badge">{user.role ?? 'owner'}</span>
                </div>
              </div>
            </section>

            {/* Contact card — editable */}
            <section className="st-card">
              <div className="st-card-header">
                <span className="st-card-icon"><Phone size={16} strokeWidth={1.8} /></span>
                <h2 className="st-card-title">Contact Number</h2>
              </div>
              <p className="st-card-desc">
                Your mobile number, kept on file for your account.
              </p>

              <form onSubmit={handleSave} className="st-form">
                <div className="st-field">
                  <label className="st-label" htmlFor="st-phone">
                    Mobile number
                  </label>
                  <div className="st-input-wrap">
                    <span className="st-prefix">+91</span>
                    <input
                      id="st-phone"
                      className="st-input"
                      type="tel"
                      inputMode="numeric"
                      maxLength={15}
                      placeholder="98765 43210"
                      value={phone.replace(/^\+?91/, '')}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                    />
                    {user.phone && (
                      <span className="st-verified" title="Number saved">
                        <CheckCircle2 size={15} />
                      </span>
                    )}
                  </div>
                  <p className="st-hint">
                    Enter your 10-digit mobile number.
                  </p>
                </div>

                {error && (
                  <div className="st-alert st-alert-err">{error}</div>
                )}
                {saved && (
                  <div className="st-alert st-alert-ok">
                    <CheckCircle2 size={14} />
                    Number saved.
                  </div>
                )}

                <div className="st-actions">
                  <button type="submit" className="st-save-btn" disabled={saving}>
                    {saving ? (
                      <><span className="st-btn-spinner" />Saving…</>
                    ) : 'Save changes'}
                  </button>
                </div>
              </form>
            </section>

          </div>
        </div>
      </main>
    </div>
  );
}
