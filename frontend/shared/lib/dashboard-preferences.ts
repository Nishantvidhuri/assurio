export const DASHBOARD_SIDEBAR_COOKIE_NAME = 'ra_dashboard_sidebar_expanded';

export function parseDashboardSidebarExpanded(
  value: string | undefined | null,
  fallback = true,
) {
  if (value === '1' || value === 'true') {
    return true;
  }

  if (value === '0' || value === 'false') {
    return false;
  }

  return fallback;
}

export function buildDashboardSidebarCookieValue(expanded: boolean) {
  return `${DASHBOARD_SIDEBAR_COOKIE_NAME}=${expanded ? '1' : '0'}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
