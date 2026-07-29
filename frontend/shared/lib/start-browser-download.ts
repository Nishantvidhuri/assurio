'use client';

function parseContentDispositionFilename(
  contentDisposition: string | null,
): string | null {
  if (!contentDisposition) {
    return null;
  }

  const utf8Match = contentDisposition.match(
    /filename\*=UTF-8''([^;]+)/i,
  );
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const basicMatch = contentDisposition.match(/filename="([^"]+)"/i);
  if (basicMatch?.[1]) {
    return basicMatch[1];
  }

  return null;
}

function getFallbackFilename(url: URL): string {
  const segments = url.pathname.split('/').filter(Boolean);
  return segments.at(-1) ?? 'download';
}

function getApiOrigin(): string | null {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (!apiBaseUrl) {
    return null;
  }

  try {
    return new URL(apiBaseUrl, window.location.href).origin;
  } catch {
    return null;
  }
}

function triggerAnchorDownload(url: string, filename?: string) {
  const link = document.createElement('a');
  link.href = url;
  if (filename) {
    link.download = filename;
  }
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export async function startBrowserDownload(url: string) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const resolvedUrl = new URL(url, window.location.href);
  const apiOrigin = getApiOrigin();

  if (
    resolvedUrl.origin === window.location.origin ||
    (apiOrigin !== null && resolvedUrl.origin === apiOrigin)
  ) {
    const response = await fetch(resolvedUrl.toString(), {
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Download failed with status ${response.status}`);
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const filename =
      parseContentDispositionFilename(
        response.headers.get('Content-Disposition'),
      ) ?? getFallbackFilename(resolvedUrl);

    try {
      triggerAnchorDownload(objectUrl, filename);
    } finally {
      window.setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
      }, 60_000);
    }

    return;
  }

  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.src = resolvedUrl.toString();
  document.body.appendChild(iframe);

  window.setTimeout(() => {
    if (iframe.parentNode) {
      iframe.parentNode.removeChild(iframe);
    }
  }, 60_000);
}
