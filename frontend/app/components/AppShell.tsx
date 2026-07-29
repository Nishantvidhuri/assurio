'use client';

/**
 * Assurio app shell — mirrors Recriauth's dashboard-shell composition:
 * RDS Sidebar rail (desktop) + mobile drawer + main column with the RDS
 * TopBar (hamburger on mobile, breadcrumbs, profile dropdown).
 *
 * Usage:
 *   <AppShell nav={ADMIN_NAV} user={user} onLogout={handleLogout}>
 *     ...page content...
 *   </AppShell>
 */
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { LogOut } from 'lucide-react';
import {
  Sidebar as RdsSidebar,
  SidebarItem as RdsSidebarItem,
  TopBar,
  Breadcrumbs,
  BreadcrumbItem,
  type ProfileMenuItem,
} from '@/shared/components/ui';
import { cn } from '@/shared/lib/utils';
import type { SidebarItem, SidebarUser } from './Sidebar';

export interface Crumb {
  label: string;
  href?: string;
}

export default function AppShell({
  nav,
  user,
  onLogout,
  breadcrumbs,
  children,
}: {
  nav: SidebarItem[];
  user: SidebarUser;
  onLogout: () => void;
  /** Hierarchical breadcrumb trail; falls back to the active nav item. */
  breadcrumbs?: Crumb[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Detail routes whose path doesn't share its section's nav prefix —
  // e.g. /admin/client/[id] (singular) belongs to the /admin/clients item.
  const ROUTE_ALIASES: Array<{ prefix: string; navHref: string }> = [
    { prefix: '/admin/client/', navHref: '/admin/clients' },
    { prefix: '/admin/subject/', navHref: '/admin/clients' },
    { prefix: '/subject/', navHref: '/home' },
  ];

  // Active matching: exact match → route alias → longest prefix (so "/admin"
  // doesn't light up while on "/admin/clients").
  const activeHref = (() => {
    const exact = nav.find((i) => i.href === pathname);
    if (exact) return exact.href;
    const alias = ROUTE_ALIASES.find(
      (a) =>
        pathname.startsWith(a.prefix) && nav.some((i) => i.href === a.navHref),
    );
    if (alias) return alias.navHref;
    const prefix = nav
      .filter((i) => pathname.startsWith(i.href + '/'))
      .sort((a, b) => b.href.length - a.href.length)[0];
    return prefix?.href ?? null;
  })();

  const activeItem = nav.find((i) => i.href === activeHref);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

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
      {nav.map((item) => (
        <RdsSidebarItem
          key={item.href}
          icon={item.icon}
          label={item.label}
          href={item.href}
          active={item.href === activeHref}
          onItemClick={onItemClick}
        />
      ))}
    </>
  );

  const logoFull = (
    <span className="flex items-center gap-2">
      <Image src="/logo-mark.png" alt="" width={24} height={24} aria-hidden="true" />
      <span className="font-[family-name:var(--font-logo)] text-[17px] leading-none text-text-heading">
        Assurio
      </span>
    </span>
  );

  const profileMenuItems: ProfileMenuItem[] = [
    { label: user.email, separatorAfter: true },
    {
      label: 'Log out',
      icon: <LogOut className="size-4" />,
      onAction: onLogout,
      destructive: true,
    },
  ];

  const home = nav[0]?.href ?? '/';

  return (
    <div className="flex h-screen overflow-hidden bg-[#F4F7FC] pt-[env(safe-area-inset-top)]">
      {/* ── Sidebar — desktop rail (lg and up) ─────────────────── */}
      <RdsSidebar
        className="hidden lg:flex"
        logo={logoFull}
        logoIcon={
          <Image src="/logo-mark.png" alt="" width={24} height={24} aria-hidden="true" />
        }
        logoHref={home}
        footer={null}
      >
        {renderNavItems()}
      </RdsSidebar>

      {/* ── Sidebar — mobile drawer (kept mounted for animation) ── */}
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
          <RdsSidebar logoHref={home} onClose={() => setMobileOpen(false)} footer={null}>
            {renderNavItems(() => setMobileOpen(false))}
          </RdsSidebar>
        </div>
      </div>

      {/* ── Main column: TopBar + scrollable content ───────────── */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        <TopBar
          onMenuClick={() => setMobileOpen(true)}
          logoHref={home}
          showSearch={false}
          userName={user.name}
          profileMenuItems={profileMenuItems}
          breadcrumbs={
            <Breadcrumbs>
              {(breadcrumbs ?? [{ label: activeItem?.label ?? 'Dashboard' }]).map(
                (crumb, i, arr) => (
                  <BreadcrumbItem
                    key={`${crumb.label}-${i}`}
                    isActive={i === arr.length - 1}
                    onClick={
                      crumb.href && i !== arr.length - 1
                        ? () => router.push(crumb.href!)
                        : undefined
                    }
                  >
                    {crumb.label}
                  </BreadcrumbItem>
                ),
              )}
            </Breadcrumbs>
          }
        />
        {/* Recriauth look: F4F7FC frame (sidebar + topbar + shell) with the
         * content as a white panel, rounded where it meets the frame corner. */}
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="min-h-full w-full rounded-tl-xl bg-white px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
