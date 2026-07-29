'use client';

import { useCallback, useState } from 'react';
import { buildDashboardSidebarCookieValue } from '@/shared/lib/dashboard-preferences';

export function useDashboardSidebarPreference(initialExpanded: boolean) {
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(initialExpanded);

  const updateSidebarExpanded = useCallback((expanded: boolean) => {
    setIsSidebarExpanded(expanded);

    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${buildDashboardSidebarCookieValue(expanded)}${secure}`;
  }, []);

  return {
    isSidebarExpanded,
    updateSidebarExpanded,
  };
}
