'use client';

type ClientSettingsTab = 'company' | 'email' | 'integrations';

type SettingsTabPreset = 'client' | 'client-postpaid' | 'internal';

export function getAnimatedSearchSuggestionsConfigForUserType(
  userType: string,
  billingModel?: string | null,
): { enable: boolean; preset: SettingsTabPreset } {
  if (userType === 'INTERNAL') {
    return { enable: true, preset: 'internal' };
  }
  if (userType === 'CLIENT') {
    // Postpaid clients have no credits — their billing hint reads plain
    // "transactions" instead of "credits transactions".
    return {
      enable: true,
      preset: billingModel === 'POSTPAID' ? 'client-postpaid' : 'client',
    };
  }
  return { enable: false, preset: 'client' };
}

function inferClientSettingsTabFromSearchText(searchedText: string): ClientSettingsTab | null {
  const normalized = searchedText.trim().toLowerCase();
  if (normalized === 'integrations') return 'integrations';
  if (normalized === 'email template' || normalized === 'email templates') return 'email';
  if (
    normalized === 'company information' ||
    normalized === 'company info' ||
    normalized === 'company profile'
  ) {
    return 'company';
  }
  return null;
}

/**
 * When global search navigates to `/dashboard/client/settings`, we want to open a specific tab
 * without keeping `?tab=` in the URL. We stash the desired tab in `sessionStorage` and let
 * `SettingsPageShell` consume it once and clean the URL.
 */
export function maybePersistClientSettingsInitialTab(route: string, searchedText: string): void {
  if (route !== '/dashboard/client/settings') return;
  const tab = inferClientSettingsTabFromSearchText(searchedText);
  if (!tab) return;
  try {
    window.sessionStorage.setItem('client-settings:initialTab', tab);
  } catch {
    // ignore storage failures
  }
}

/**
 * When landing on the client candidates list from global search, carry the typed
 * query into `?search=` so the table API and in-page search match (e.g. design, names).
 * Skips profile routes and the Add Candidate dropdown handoff (`openAddCandidate=1`).
 */
export function applyTopbarQueryToClientCandidatesRoute(
  route: string,
  topbarQuery: string,
): string {
  const q = topbarQuery.trim();
  if (!q) return route;

  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
  let url: URL;
  try {
    url = new URL(route, origin);
  } catch {
    return route;
  }

  const path = url.pathname.replace(/\/$/, '') || '/';
  if (path !== '/dashboard/client/candidates') {
    return route;
  }

  if (url.searchParams.get('openAddCandidate') === '1') {
    return route;
  }

  url.searchParams.set('search', q);
  url.searchParams.set('page', '1');
  return `${url.pathname}${url.search}`;
}

export function handleTopbarGlobalSearchResultSelect(args: {
  router: { push: (href: string) => void };
  route: string;
  searchedText: string;
  currentSearchValue: string;
}) {
  const { router, route, searchedText, currentSearchValue } = args;
  const trimmed = currentSearchValue.trim();
  maybePersistClientSettingsInitialTab(route, searchedText);
  router.push(applyTopbarQueryToClientCandidatesRoute(route, trimmed));
}

