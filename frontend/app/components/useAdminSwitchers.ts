'use client';

import { useEffect, useState } from 'react';
import { adminClient, adminClients } from '../lib/api';
import { getToken } from '../lib/session';
import type { BreadcrumbMenuItem } from '@/shared/components/ui';

/**
 * Loads the sibling lists that power the breadcrumb switchers on admin
 * candidate/client pages:
 *   • clientMenu    — every client (to switch which client you're viewing)
 *   • candidateMenu — the given client's candidates + drafts (to jump siblings)
 * Both are best-effort and non-blocking; empty until loaded.
 */
export function useAdminSwitchers(
  clientId?: string | null,
  currentCandidateId?: string | null,
) {
  const [clientMenu, setClientMenu] = useState<BreadcrumbMenuItem[]>([]);
  const [candidateMenu, setCandidateMenu] = useState<BreadcrumbMenuItem[]>([]);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    let cancelled = false;
    adminClients(token)
      .then((cs) => {
        if (cancelled) return;
        setClientMenu(
          cs.map((c) => ({
            label: c.name,
            href: `/admin/client/${c.id}`,
            active: c.id === clientId,
          })),
        );
      })
      .catch(() => {
        /* best-effort */
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  useEffect(() => {
    const token = getToken();
    if (!token || !clientId) return;
    let cancelled = false;
    adminClient(token, clientId)
      .then((d) => {
        if (cancelled) return;
        const subs: BreadcrumbMenuItem[] = d.subjects.map((s) => ({
          label: s.name,
          href: `/admin/subject/${s.id}`,
          active: s.id === currentCandidateId,
        }));
        const drafts: BreadcrumbMenuItem[] = d.drafts.map((dr) => ({
          label: (dr.data.name || '').trim() || 'Untitled draft',
          href: `/admin/draft/${dr.id}`,
          active: dr.id === currentCandidateId,
        }));
        setCandidateMenu([...subs, ...drafts]);
      })
      .catch(() => {
        /* best-effort */
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, currentCandidateId]);

  return { clientMenu, candidateMenu };
}
