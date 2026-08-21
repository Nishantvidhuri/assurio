const createNextIntlPlugin = require('next-intl/plugin');

// Points at i18n/request.ts, which resolves the locale per request.
const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/** @type {import('next').NextConfig} */

// Proxy target — next.config.js runs in Node so all env vars are available.
const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.API_URL ||
  'http://localhost:3001';

const nextConfig = {
  async rewrites() {
    return [
      // Serve the Bull Board UI through port 3000 instead of 3001.
      // All sub-paths (static assets, internal API calls) are also proxied.
      // Auth is enforced server-side by BullBoardAuthMiddleware (reads as_access cookie).
      {
        source: '/admin/queues',
        destination: `${API_URL}/admin/queues`,
      },
      {
        source: '/admin/queues/:path*',
        destination: `${API_URL}/admin/queues/:path*`,
      },
    ];
  },
};

module.exports = withNextIntl(nextConfig);
