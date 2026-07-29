'use client';

import { useEffect, useMemo } from 'react';

interface PreviewEntry {
  url: string;
  refCount: number;
  revokeTimer: ReturnType<typeof setTimeout> | null;
}

const previewCache = new Map<string, PreviewEntry>();

function buildFileKey(file: File): string {
  return `${file.name}::${file.size}::${file.type}::${file.lastModified}`;
}

function getOrCreatePreviewUrl(file: File): { key: string; url: string } {
  const key = buildFileKey(file);
  const existing = previewCache.get(key);
  if (existing) {
    return { key, url: existing.url };
  }

  const url = URL.createObjectURL(file);
  previewCache.set(key, { url, refCount: 0, revokeTimer: null });
  return { key, url };
}

function retainPreview(key: string) {
  const entry = previewCache.get(key);
  if (!entry) return;
  if (entry.revokeTimer) {
    clearTimeout(entry.revokeTimer);
    entry.revokeTimer = null;
  }
  entry.refCount += 1;
}

function releasePreview(key: string) {
  const entry = previewCache.get(key);
  if (!entry) return;

  entry.refCount -= 1;
  if (entry.refCount > 0) return;

  // Defer revocation to survive React Strict Mode mount-cleanup-remount cycles.
  entry.revokeTimer = setTimeout(() => {
    const latest = previewCache.get(key);
    if (!latest || latest.refCount > 0) return;
    URL.revokeObjectURL(latest.url);
    previewCache.delete(key);
  }, 0);
}

/**
 * Shared, reference-counted preview URL hook for File objects.
 *
 * Why this exists:
 * - Multi-step forms often unmount/remount file preview components.
 * - Creating/revoking blob URLs inside each mount can invalidate previews.
 * - We keep a tiny in-memory cache keyed by file identity, and ref-count it.
 */
export function useFilePreviewCache(file: File | null): string | null {
  const preview = useMemo(() => {
    if (!file) return null;
    return getOrCreatePreviewUrl(file);
  }, [file]);

  useEffect(() => {
    if (!preview) return;
    retainPreview(preview.key);
    return () => {
      releasePreview(preview.key);
    };
  }, [preview]);

  return preview?.url ?? null;
}
