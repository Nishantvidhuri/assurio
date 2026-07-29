'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Activity, ExternalLink, FileText, LayoutDashboard, Menu, Receipt, Users, X } from 'lucide-react';
import Brand from './Brand';

// Proxied through Next.js rewrites — accessible at the same port as the app.
const BULL_BOARD_URL = '/admin/queues';

export interface SidebarItem {
  href: string;
  label: string;
  icon: ReactNode;
}

export interface SidebarUser {
  name: string;
  email: string;
  role?: string;
}

export default function Sidebar({
  items,
  user,
  onLogout,
}: {
  items: SidebarItem[];
  user: SidebarUser;
  onLogout: () => void;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Pick the single best-matching item:
  //  - exact match wins
  //  - otherwise the *longest* href that the pathname starts with
  // This stops "/admin" from lighting up while on "/admin/clients".
  const activeHref = (() => {
    const exact = items.find((i) => i.href === pathname);
    if (exact) return exact.href;
    const prefix = items
      .filter((i) => pathname.startsWith(i.href + '/'))
      .sort((a, b) => b.href.length - a.href.length)[0];
    return prefix?.href ?? null;
  })();

  const isActive = (href: string) => href === activeHref;

  // Close drawer on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while drawer is open
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  const nav = (
    <>
      <div className="sb-brand">
        <Brand />
      </div>

      <nav className="sb-nav">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`sb-link ${isActive(item.href) ? 'is-active' : ''}`}
          >
            <span className="sb-link-icon">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}

        {user.role === 'admin' && (
          <>
            <div className="sb-nav-sep" />
            <a
              href={BULL_BOARD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="sb-link sb-link-external"
            >
              <span className="sb-link-icon"><Activity size={18} strokeWidth={1.7} /></span>
              <span>Queues</span>
              <ExternalLink size={12} strokeWidth={1.7} className="sb-link-ext-icon" />
            </a>
          </>
        )}
      </nav>

      <div className="sb-foot">
        <div className="sb-user">
          <span className="sb-avatar">
            {(user.name || '?').charAt(0).toUpperCase()}
          </span>
          <div className="sb-user-meta">
            <div className="sb-user-name">{user.name}</div>
            <div className="sb-user-role">{user.role || 'client'}</div>
          </div>
        </div>
        <button className="link-btn sb-logout" onClick={onLogout}>
          Log out
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile top bar */}
      <header className="sb-mobile-bar" role="banner">
        <button
          type="button"
          className="sb-burger"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
        <div className="sb-mobile-brand">
          <Brand />
        </div>
        <span className="sb-mobile-avatar" title={user.name}>
          {(user.name || '?').charAt(0).toUpperCase()}
        </span>
      </header>

      {/* Desktop sidebar */}
      <aside className="sb sb-desktop">{nav}</aside>

      {/* Mobile drawer */}
      <div
        className={`sb-drawer ${open ? 'is-open' : ''}`}
        aria-hidden={!open}
      >
        <button
          type="button"
          className="sb-drawer-scrim"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        />
        <aside className="sb sb-panel">{nav}</aside>
      </div>
    </>
  );
}

/* Common nav icons (lucide). Sized to 18px to match prior visual weight. */
export const ICONS = {
  dashboard: <LayoutDashboard size={18} strokeWidth={1.7} />,
  billing: <Receipt size={18} strokeWidth={1.7} />,
  clients: <Users size={18} strokeWidth={1.7} />,
  invoices: <FileText size={18} strokeWidth={1.7} />,
  operations: <Activity size={18} strokeWidth={1.7} />,
};
