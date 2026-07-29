export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

export const AUTH_INVALIDATED_EVENT = 'recriauth:auth-invalidated';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  cache?: RequestCache;
  /**
   * Marks the request as `keepalive` so the browser keeps it in flight across
   * a page unload / hard navigation instead of aborting it. Use for small
   * fire-and-navigate writes (e.g. the onboarding terminal PATCH that runs
   * right before `window.location.href`). Bodies are capped at ~64 KB by the
   * platform when set.
   */
  keepalive?: boolean;
  _skipAuthRefresh?: boolean;
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

const AUTH_REFRESH_PATH = '/v1/auth/refresh';

let refreshPromise: Promise<boolean> | null = null;
let authInvalidationPromise: Promise<never> | null = null;

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const cookies = document.cookie.split(';');
  for (const item of cookies) {
    const [key, ...rest] = item.trim().split('=');
    if (key === name) {
      return decodeURIComponent(rest.join('='));
    }
  }

  return null;
}

function shouldAttemptRefresh(path: string, options: RequestOptions): boolean {
  if (options._skipAuthRefresh) {
    return false;
  }

  if (path === AUTH_REFRESH_PATH) {
    return false;
  }

  if (path === '/v1/auth/login') {
    return false;
  }

  return true;
}

function shouldInvalidateBrowserSession(
  path: string,
  response: Response,
  options: RequestOptions,
): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  if (response.status !== 401) {
    return false;
  }

  if (!shouldAttemptRefresh(path, options)) {
    return false;
  }

  if (path.startsWith('/v1/auth/')) {
    return false;
  }

  return true;
}

function isCsrfMismatchPayload(payload: unknown): boolean {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }
  const message = (payload as { message?: unknown }).message;
  return typeof message === 'string' && /csrf/i.test(message);
}

async function performRequest(
  path: string,
  options: RequestOptions = {},
): Promise<Response> {
  // FormData / Blob bodies have to pass through untouched so fetch can
  // set the right Content-Type (multipart boundary, octet-stream, etc).
  // JSON.stringify(FormData) → "{}" silently, which is the classic
  // "why is my upload empty" bug — guard against it explicitly.
  const isMultipart =
    typeof FormData !== 'undefined' && options.body instanceof FormData;
  const isRawBlob =
    typeof Blob !== 'undefined' && options.body instanceof Blob;
  const passthroughBody = isMultipart || isRawBlob;

  return fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    credentials: 'include',
    cache: options.cache ?? 'no-store',
    keepalive: options.keepalive ?? false,
    headers: {
      // Skip Content-Type for multipart so fetch writes the
      // boundary header itself.
      ...(options.body && !passthroughBody
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...(options.headers ?? {}),
    },
    body: passthroughBody
      ? (options.body as BodyInit)
      : options.body
        ? JSON.stringify(options.body)
        : undefined,
  });
}

async function tryRefreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const csrfToken = readCookie(
        process.env.NEXT_PUBLIC_CSRF_COOKIE_NAME ?? 'ra_csrf',
      );

      if (!csrfToken) {
        return false;
      }

      const response = await fetch(`${API_BASE_URL}${AUTH_REFRESH_PATH}`, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          'X-CSRF-Token': csrfToken,
        },
      });

      return response.ok;
    })().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

function invalidateBrowserSession(): Promise<never> {
  if (!authInvalidationPromise) {
    authInvalidationPromise = new Promise<never>(() => {
      window.dispatchEvent(new Event(AUTH_INVALIDATED_EVENT));
      window.location.replace('/login');
    });
  }

  return authInvalidationPromise;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  let response = await performRequest(path, options);

  if (response.status === 401 && shouldAttemptRefresh(path, options)) {
    const refreshed = await tryRefreshSession();

    if (refreshed) {
      const refreshedCsrf = readCookie(
        process.env.NEXT_PUBLIC_CSRF_COOKIE_NAME ?? 'ra_csrf',
      );
      const headers = { ...(options.headers ?? {}) };
      if (refreshedCsrf && 'X-CSRF-Token' in headers) {
        headers['X-CSRF-Token'] = refreshedCsrf;
      }
      response = await performRequest(path, {
        ...options,
        headers,
        _skipAuthRefresh: true,
      });
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

    if (shouldInvalidateBrowserSession(path, response, options)) {
      return invalidateBrowserSession();
    }

    if (
      response.status === 403 &&
      typeof window !== 'undefined' &&
      !path.startsWith('/v1/auth/') &&
      isCsrfMismatchPayload(payload)
    ) {
      return invalidateBrowserSession();
    }

    throw new ApiError(message, response.status, payload);
  }

  return payload as T;
}
