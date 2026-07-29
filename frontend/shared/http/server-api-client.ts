import { cookies } from 'next/headers';
import { SERVER_API_UNAUTHORIZED_DIGEST } from './server-api-error-digests';

/**
 * Server-side API client for use in Server Components and Server Actions.
 *
 * Reads cookies from the incoming request via `next/headers` and forwards them
 * to the NestJS backend so that auth (httpOnly JWT) and CSRF tokens travel
 * transparently. Supports Next.js cache tags and revalidation.
 *
 * NOT usable in client components — use `apiRequest` from `api-client.ts` there.
 */

// Re-export so existing call sites can keep importing the digest from this
// module. New Client Component imports should pull directly from
// `./server-api-error-digests` to avoid the `next/headers` dependency.
export { SERVER_API_UNAUTHORIZED_DIGEST };

export class ServerApiError extends Error {
  status: number;
  payload: unknown;
  digest?: string;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = 'ServerApiError';
    this.status = status;
    this.payload = payload;
    if (status === 401) this.digest = SERVER_API_UNAUTHORIZED_DIGEST;
  }
}

interface ServerRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  tags?: string[];
  revalidate?: number | false;
  _skipAuthRefresh?: boolean;
}

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';
const CSRF_COOKIE_NAME =
  process.env.NEXT_PUBLIC_CSRF_COOKIE_NAME ?? 'ra_csrf';
const AUTH_REFRESH_PATH = '/v1/auth/refresh';
const inFlightRefreshes = new Map<string, Promise<ServerRefreshResult>>();

type ServerRefreshResult = {
  ok: boolean;
  setCookieHeaders: string[];
};

type ParsedSetCookie = {
  name: string;
  value: string;
  options: {
    path?: string;
    domain?: string;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'lax' | 'strict' | 'none';
    maxAge?: number;
    expires?: Date;
  };
};

function shouldAttemptRefresh(path: string, options: ServerRequestOptions) {
  if (options._skipAuthRefresh) {
    return false;
  }

  if (path === AUTH_REFRESH_PATH || path === '/v1/auth/login') {
    return false;
  }

  return true;
}

function parseCookieHeader(cookieHeader: string) {
  const cookieMap = new Map<string, string>();

  for (const segment of cookieHeader.split(';')) {
    const trimmed = segment.trim();
    if (!trimmed) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex);
    const value = trimmed.slice(separatorIndex + 1);
    cookieMap.set(key, value);
  }

  return cookieMap;
}

function serializeCookieHeader(cookieMap: Map<string, string>) {
  return Array.from(cookieMap.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

function parseSetCookie(setCookieHeader: string): ParsedSetCookie | null {
  const segments = setCookieHeader.split(';').map((segment) => segment.trim());
  const [nameValue, ...attributes] = segments;
  const separatorIndex = nameValue.indexOf('=');

  if (separatorIndex <= 0) {
    return null;
  }

  const parsed: ParsedSetCookie = {
    name: nameValue.slice(0, separatorIndex),
    value: nameValue.slice(separatorIndex + 1),
    options: {},
  };

  for (const attribute of attributes) {
    const [rawKey, ...rest] = attribute.split('=');
    const key = rawKey.toLowerCase();
    const value = rest.join('=');

    if (key === 'path' && value) {
      parsed.options.path = value;
    } else if (key === 'domain' && value) {
      parsed.options.domain = value;
    } else if (key === 'httponly') {
      parsed.options.httpOnly = true;
    } else if (key === 'secure') {
      parsed.options.secure = true;
    } else if (key === 'samesite' && value) {
      const sameSite = value.toLowerCase();
      if (sameSite === 'lax' || sameSite === 'strict' || sameSite === 'none') {
        parsed.options.sameSite = sameSite;
      }
    } else if (key === 'max-age' && value) {
      const maxAge = Number(value);
      if (Number.isFinite(maxAge)) {
        parsed.options.maxAge = maxAge;
      }
    } else if (key === 'expires' && value) {
      const expires = new Date(value);
      if (!Number.isNaN(expires.getTime())) {
        parsed.options.expires = expires;
      }
    }
  }

  return parsed;
}

function mergeCookieHeader(
  existingCookieHeader: string,
  setCookieHeaders: string[],
) {
  const cookieMap = parseCookieHeader(existingCookieHeader);

  for (const setCookieHeader of setCookieHeaders) {
    const parsed = parseSetCookie(setCookieHeader);
    if (parsed) {
      cookieMap.set(parsed.name, parsed.value);
    }
  }

  return serializeCookieHeader(cookieMap);
}

async function syncSetCookiesToNextStore(
  setCookieHeaders: string[],
): Promise<boolean> {
  const cookieStore = await cookies();

  for (const setCookieHeader of setCookieHeaders) {
    const parsed = parseSetCookie(setCookieHeader);
    if (!parsed) {
      continue;
    }

    try {
      cookieStore.set(parsed.name, parsed.value, parsed.options);
    } catch {
      return false;
    }
  }
  return true;
}

async function performServerRequest(
  path: string,
  cookieHeader: string,
  options: ServerRequestOptions = {},
) {
  const isMutation = options.method && options.method !== 'GET';
  const cookieMap = parseCookieHeader(cookieHeader);

  const fetchOptions: RequestInit & { next?: Record<string, unknown> } = {
    method: options.method ?? 'GET',
    headers: {
      Cookie: cookieHeader,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(isMutation
        ? { 'X-CSRF-Token': cookieMap.get(CSRF_COOKIE_NAME) ?? '' }
        : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  };

  if (isMutation) {
    fetchOptions.cache = 'no-store';
  } else {
    fetchOptions.next = {
      tags: options.tags,
      revalidate: options.revalidate,
    };
  }

  return fetch(`${API_BASE_URL}${path}`, fetchOptions);
}

async function refreshServerSession(
  cookieHeader: string,
): Promise<ServerRefreshResult> {
  const existing = inFlightRefreshes.get(cookieHeader);
  if (existing) {
    return existing;
  }

  const refreshPromise = (async (): Promise<ServerRefreshResult> => {
    const refreshResponse = await performServerRequest(AUTH_REFRESH_PATH, cookieHeader, {
      method: 'POST',
      _skipAuthRefresh: true,
    });

    return {
      ok: refreshResponse.ok,
      setCookieHeaders: refreshResponse.headers.getSetCookie(),
    };
  })().finally(() => {
    inFlightRefreshes.delete(cookieHeader);
  });

  inFlightRefreshes.set(cookieHeader, refreshPromise);
  return refreshPromise;
}

export async function serverApiRequest<T>(
  path: string,
  options: ServerRequestOptions = {},
): Promise<T> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
  let response = await performServerRequest(path, cookieHeader, options);

  if (response.status === 401 && shouldAttemptRefresh(path, options)) {
    const refreshResult = await refreshServerSession(cookieHeader);

    let cookiesPropagated = true;
    if (refreshResult.setCookieHeaders.length > 0) {
      cookiesPropagated = await syncSetCookiesToNextStore(
        refreshResult.setCookieHeaders,
      );
    }

    if (refreshResult.ok && cookiesPropagated) {
      const refreshedCookieHeader = mergeCookieHeader(
        cookieHeader,
        refreshResult.setCookieHeaders,
      );

      response = await performServerRequest(path, refreshedCookieHeader, {
        ...options,
        _skipAuthRefresh: true,
      });
    } else if (refreshResult.ok && !cookiesPropagated) {
      // Server-side refresh rotated the session but we are running inside a
      // Server Component where cookies().set() is not allowed, so the new
      // auth cookies cannot be sent to the browser. Don't retry — the retry
      // would succeed here but leave the browser holding stale cookies, and
      // the next client-side CSRF-protected request would fail with
      // "Invalid session CSRF token". Surface the original 401 instead so
      // the page redirects through a normal auth flow.
    }
  }

  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message =
      typeof payload === 'object' &&
      payload !== null &&
      'message' in payload &&
      typeof (payload as { message?: unknown }).message === 'string'
        ? ((payload as { message: string }).message as string)
        : `Request failed with status ${response.status}`;

    throw new ServerApiError(message, response.status, payload);
  }

  return payload as T;
}
