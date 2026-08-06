'use client';

/**
 * Inline file preview modal — same pattern as Recriauth's FilePreviewDialog:
 * renders a PDF (iframe) or image (img) inline in an overlay, with an
 * "Open in new tab" escape hatch. Expects a directly-loadable URL (e.g. a
 * presigned S3 link), so no server proxy is involved.
 */
import { useEffect } from 'react';

export interface PreviewFile {
  url: string;
  name?: string;
  contentType?: string;
}

function looksLike(file: PreviewFile, re: RegExp, mime: string): boolean {
  if ((file.contentType || '').toLowerCase().includes(mime)) return true;
  const path = file.url.split('?')[0];
  return re.test(path);
}

export default function FilePreviewModal({
  file,
  onClose,
}: {
  file: PreviewFile;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const isImage = looksLike(file, /\.(png|jpe?g|webp|gif|bmp)$/i, 'image/');
  const isPdf = looksLike(file, /\.pdf$/i, 'pdf');

  return (
    <div className="pdf-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="pdf-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={file.name || 'Preview'}
      >
        <header className="pdf-modal-head">
          <div className="pdf-modal-title">{file.name || 'Document'}</div>
          <div className="pdf-modal-actions">
            <a
              className="pdf-modal-link"
              href={file.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in new tab ↗
            </a>
            <button
              type="button"
              className="pdf-modal-close"
              onClick={onClose}
              aria-label="Close preview"
            >
              ×
            </button>
          </div>
        </header>
        {isImage ? (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflow: 'auto',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'center',
              padding: 16,
              background: '#f4f4f5',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={file.url}
              alt={file.name || ''}
              style={{ maxWidth: '100%', height: 'auto', display: 'block' }}
            />
          </div>
        ) : isPdf ? (
          <iframe
            className="pdf-modal-frame"
            src={file.url}
            title={file.name || 'Document'}
          />
        ) : (
          <div className="pdf-modal-empty">
            <div>Preview isn&apos;t available for this file type.</div>
            <a
              className="pdf-modal-link"
              href={file.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in a new tab ↗
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
