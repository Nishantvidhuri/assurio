// Stable Next.js error `digest` markers attached by `ServerApiError`. Lives
// in its own module (no `next/headers` import, no Node-only deps) so Client
// Components — including the `app/dashboard/error.tsx` boundary — can import
// these constants without dragging in the full server-api-client module.
export const SERVER_API_UNAUTHORIZED_DIGEST = 'SERVER_API_UNAUTHORIZED';
