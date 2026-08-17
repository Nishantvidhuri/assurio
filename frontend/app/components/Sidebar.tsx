'use client';

import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Boxes, Activity, LayoutDashboard, FileText, FlaskConical, LogOut, Menu, Package, Receipt, Settings, Users } from 'lucide-react';
import {
  Sidebar as RdsSidebar,
  SidebarItem as RdsSidebarItem,
} from '@/shared/components/ui';
import { cn } from '@/shared/lib/utils';

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

/** User block + logout rendered in the sidebar footer slot. */
function SidebarFooter({ user, onLogout }: { user: SidebarUser; onLogout: () => void }) {
  return (
    <div className="flex flex-col gap-3 border-t border-border-default px-2 pt-3">
      <div className="flex items-center gap-2.5 overflow-hidden">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-btn-primary text-sm font-semibold text-white">
          {(user.name || '?').charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <div className="truncate text-body-md font-medium text-text-heading">{user.name}</div>
          <div className="truncate text-body-sm text-text-placeholder capitalize">
            {user.role || 'client'}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onLogout}
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-body-md font-medium text-text-body transition-colors hover:bg-neutral-300"
      >
        <LogOut className="size-4" />
        Log out
      </button>
    </div>
  );
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
  const [mobileOpen, setMobileOpen] = useState(false);

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

  // Close drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Lock body scroll while drawer is open
  useEffect(() => {
    if (mobileOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [mobileOpen]);

  const renderNavItems = (onItemClick?: () => void) => (
    <>
      {items.map((item) => (
        <RdsSidebarItem
          key={item.href}
          icon={item.icon}
          label={item.label}
          href={item.href}
          active={item.href === activeHref}
          onItemClick={onItemClick}
        />
      ))}
      {user.role === 'admin' && (
        <RdsSidebarItem
          icon={<Activity />}
          label="Queues"
          onItemClick={() => window.open(BULL_BOARD_URL, '_blank', 'noopener')}
        />
      )}
    </>
  );

  // Compact brand row for the sidebar header — deliberately NOT <Brand />,
  // whose auth-page margin-bottom overflows (and clips inside) the fixed-height
  // RDS sidebar header.
  const logoFull = (
    <span className="flex items-center gap-2">
      <Image src="/logo-mark.png" alt="" width={24} height={24} aria-hidden="true" />
      <span className="font-[family-name:var(--font-logo)] text-[17px] leading-none text-text-heading">
        Assurio
      </span>
    </span>
  );

  const logoIcon = (
    <Image src="/logo-mark.png" alt="" width={24} height={24} aria-hidden="true" />
  );

  return (
    <>
      {/* ── Mobile top bar (below lg) ─────────────────────────── */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 border-b border-border-default bg-white px-4 lg:hidden">
        <button
          type="button"
          aria-label="Open menu"
          onClick={() => setMobileOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-md text-text-body hover:bg-neutral-300"
        >
          <Menu className="size-5" />
        </button>
        {logoFull}
        <span className="ml-auto flex h-8 w-8 items-center justify-center rounded-md bg-surface-btn-primary text-sm font-semibold text-white">
          {(user.name || '?').charAt(0).toUpperCase()}
        </span>
      </header>
      {/* Spacer so page content clears the fixed mobile bar */}
      <div className="h-14 lg:hidden" aria-hidden="true" />

      {/* ── Desktop rail (lg and up) ──────────────────────────── */}
      <RdsSidebar
        className="hidden lg:flex"
        logo={logoFull}
        logoIcon={logoIcon}
        logoHref={items[0]?.href ?? '/'}
        footer={<SidebarFooter user={user} onLogout={onLogout} />}
      >
        {renderNavItems()}
      </RdsSidebar>

      {/* ── Mobile drawer — kept mounted for open/close animation ── */}
      <div
        className={cn(
          'fixed inset-0 z-50 lg:hidden',
          mobileOpen ? 'pointer-events-auto' : 'pointer-events-none',
        )}
        aria-hidden={!mobileOpen}
      >
        <button
          type="button"
          aria-label="Close menu"
          tabIndex={mobileOpen ? 0 : -1}
          onClick={() => setMobileOpen(false)}
          className={cn(
            'absolute inset-0 bg-[rgba(11,26,59,0.45)] transition-opacity duration-300 ease-in-out',
            mobileOpen ? 'opacity-100' : 'opacity-0',
          )}
        />
        <div
          className={cn(
            'absolute inset-y-0 left-0 flex transition-transform duration-300 ease-in-out',
            mobileOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <RdsSidebar
            logoHref={items[0]?.href ?? '/'}
            onClose={() => setMobileOpen(false)}
            footer={<SidebarFooter user={user} onLogout={onLogout} />}
          >
            {renderNavItems(() => setMobileOpen(false))}
          </RdsSidebar>
        </div>
      </div>
    </>
  );
}

/* Common nav icons (lucide). RDS SidebarItem sizes them to 16px itself. */
/** WhatsApp brand glyph (lucide has no brand icons). Uses currentColor so the
 *  RDS SidebarItem can tint it like the lucide icons. */
function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.334.101 11.892c0 2.096.549 4.14 1.595 5.945L0 24l6.335-1.652a12.062 12.062 0 005.71 1.447h.005c6.585 0 11.946-5.336 11.949-11.896 0-3.176-1.24-6.165-3.495-8.411" />
    </svg>
  );
}

export const ICONS = {
  dashboard: <LayoutDashboard />,
  billing: <Receipt />,
  clients: <Users />,
  invoices: <FileText />,
  operations: <Activity />,
  vendors: <Boxes />,
  testVerification: <FlaskConical />,
  packages: <Package />,
  settings: <Settings />,
  whatsapp: <WhatsAppIcon />,
};

/**
 * Client (owner) sidebar nav — single source of truth so every page shows the
 * same items. Previously each page redeclared this and they drifted (Settings
 * was missing on a couple of pages).
 */
export const CLIENT_NAV: SidebarItem[] = [
  { href: '/home', label: 'Dashboard', icon: ICONS.dashboard },
  { href: '/home/billing', label: 'Billing', icon: ICONS.billing },
  { href: '/home/settings', label: 'Settings', icon: ICONS.settings },
];
