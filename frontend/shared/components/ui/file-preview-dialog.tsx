/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { useFilePreviewCache } from '@/shared/hooks/use-file-preview-cache';
import { Button } from './button';
import { DialogBox } from './dialog-box';
import { Loader } from './loader';

export interface FilePreviewDialogProps {
  open: boolean;
  onClose: () => void;
  file?: File | null;
  fileUrl?: string | null;
  isLoading?: boolean;
  fileName?: string;
  mimeType?: string;
  title?: string;
  className?: string;
  // Render a Download button in the header that downloads the
  // currently-previewed file. **Opt-in** — defaults to false so most
  // preview surfaces (identity docs, address proofs, screenshots,
  // candidate-submitted files, etc.) don't surface a Download CTA the
  // way they shouldn't. Pass `showDownload={true}` only on screens
  // where downloading the file is an intentional capability — e.g. the
  // verification-queue call-recording playback.
  showDownload?: boolean;
}

interface CsvPreviewData {
  headers: string[];
  rows: string[][];
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function parseCsvPreview(csvText: string): CsvPreviewData {
  const lines = csvText
    .replace(/\uFEFF/g, '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = parseCsvLine(lines[0]).map((cell) => cell.trim());
  const rows = lines
    .slice(1, 101)
    .map((line) => parseCsvLine(line))
    .map((cells) => {
      if (cells.length >= headers.length) return cells;
      return [...cells, ...Array.from({ length: headers.length - cells.length }, () => '')];
    });

  return { headers, rows };
}

/**
 * RDS File Preview Dialog — reusable centered file preview modal.
 *
 * Uses DialogBox and supports:
 * - image preview
 * - PDF inline preview
 * - fallback action for unsupported in-browser previews
 */
export function FilePreviewDialog({
  open,
  onClose,
  file,
  fileUrl,
  isLoading = false,
  fileName,
  mimeType,
  title,
  className,
  showDownload,
}: FilePreviewDialogProps) {
  const cachedFileUrl = useFilePreviewCache(file ?? null);
  const resolvedFileUrl = fileUrl ?? cachedFileUrl;
  const resolvedFileName = file?.name ?? fileName ?? null;
  const resolvedMimeType = file?.type ?? mimeType ?? '';
  const [imageLoadFailed, setImageLoadFailed] = useState(false);

  useEffect(() => {
    setImageLoadFailed(false);
  }, [resolvedFileUrl]);
  const extension =
    resolvedFileName?.split('.').pop()?.toLowerCase() ??
    resolvedFileUrl?.split('.').pop()?.toLowerCase()?.split('?')[0] ??
    '';
  const isImage = Boolean(
    resolvedMimeType.startsWith('image/') ||
      ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(extension),
  );
  const isPdf = Boolean(resolvedMimeType === 'application/pdf' || extension === 'pdf');
  const isVideo = Boolean(
    resolvedMimeType.startsWith('video/') ||
      ['mp4', 'webm', 'mov', 'm4v', 'ogg', 'ogv'].includes(extension),
  );
  const isAudio = Boolean(
    resolvedMimeType.startsWith('audio/') ||
      ['mp3', 'wav', 'm4a', 'aac', 'oga'].includes(extension),
  );
  const isCsv = Boolean(
    resolvedMimeType === 'text/csv' ||
      resolvedMimeType === 'application/csv' ||
      resolvedMimeType === 'application/vnd.ms-excel' ||
      extension === 'csv',
  );
  // Download is opt-in — only render the button when the caller
  // explicitly sets `showDownload={true}` AND we actually have a URL
  // to anchor the download to. Hides everywhere else (most identity /
  // screenshot / inline-preview surfaces) so the CTA only appears on
  // screens where downloading is an intentional capability.
  const downloadEnabled = showDownload === true && Boolean(resolvedFileUrl);
  const [csvPreview, setCsvPreview] = useState<CsvPreviewData | null>(null);
  const [csvLoading, setCsvLoading] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadCsvPreview = async () => {
      if (!open || !isCsv) {
        setCsvPreview(null);
        setCsvError(null);
        setCsvLoading(false);
        return;
      }

      setCsvLoading(true);
      setCsvError(null);
      try {
        const csvText = file
          ? await file.text()
          : resolvedFileUrl
            ? await fetch(resolvedFileUrl).then(async (response) => {
                if (!response.ok) {
                  throw new Error('Failed to fetch CSV file.');
                }
                return response.text();
              })
            : '';

        if (cancelled) return;
        setCsvPreview(parseCsvPreview(csvText));
      } catch {
        if (cancelled) return;
        setCsvPreview(null);
        setCsvError('CSV preview is unavailable. You can still open the file in a new tab.');
      } finally {
        if (!cancelled) {
          setCsvLoading(false);
        }
      }
    };

    void loadCsvPreview();

    return () => {
      cancelled = true;
    };
  }, [file, isCsv, open, resolvedFileUrl]);

  return (
    <DialogBox open={open} onClose={onClose} className={className ?? 'w-[min(92vw,900px)]'}>
      <div className="flex max-h-[80vh] min-h-[420px] flex-col gap-3 p-5">
        <div className="flex items-center justify-between border-b border-border-default pb-3">
          <p className="text-body-lg font-semibold leading-body-l text-text-heading">
            {title ?? resolvedFileName ?? 'File preview'}
          </p>
          <div className="flex items-center gap-3">
            {downloadEnabled && resolvedFileUrl ? (
              <a
                href={resolvedFileUrl}
                download={resolvedFileName ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Download file"
                className="inline-flex items-center gap-1.5 rounded-md border border-border-hover bg-white px-3 py-1.5 text-body-sm font-medium text-text-body hover:bg-neutral-200"
              >
                <Download className="size-4" />
                Download
              </a>
            ) : null}
            <button
              type="button"
              aria-label="Close preview"
              className="inline-flex size-5 items-center justify-center text-icon-default hover:text-text-body"
              onClick={onClose}
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        <div className="h-full min-h-[320px] overflow-auto rounded-md border border-border-default bg-white">
          {isLoading ? (
            <div className="flex h-full min-h-[320px] items-center justify-center p-6">
              <Loader size={40} description="Loading preview..." />
            </div>
          ) : resolvedFileUrl ? (
            isImage ? (
              imageLoadFailed ? (
                <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 p-6">
                  <p className="text-body-md font-medium leading-[20px] tracking-body-md text-text-subheading text-center">
                    Unable to render this image inline.
                  </p>
                  <Button
                    type="button"
                    variant="link"
                    onClick={() =>
                      window.open(resolvedFileUrl, '_blank', 'noopener,noreferrer')
                    }
                  >
                    Open file in new tab
                  </Button>
                </div>
              ) : (
                // Wrap the <img> in a flex centring container so the
                // image sits in the middle of its preview region and
                // can't stretch to fill (no upscaling). The image
                // itself is constrained to the dialog's interior with
                // `max-h` + `max-w` so small screenshots render at
                // their natural size and large ones letterbox cleanly.
                <div className="flex h-full w-full items-center justify-center bg-neutral-50 p-4">
                  <img
                    src={resolvedFileUrl}
                    alt={resolvedFileName ?? 'Preview file'}
                    className="max-h-[60vh] max-w-full object-contain"
                    onError={() => setImageLoadFailed(true)}
                    referrerPolicy="no-referrer"
                  />
                </div>
              )
            ) : isPdf ? (
              <iframe
                src={`${resolvedFileUrl}#view=FitH&zoom=page-fit`}
                title={`${resolvedFileName ?? 'File'} preview`}
                className="block h-[70vh] min-h-[320px] w-full bg-white"
              />
            ) : isVideo ? (
              <div className="flex h-full min-h-[320px] items-center justify-center bg-black">
                <video
                  src={resolvedFileUrl}
                  controls
                  preload="metadata"
                  className="max-h-[70vh] w-full"
                  style={{ aspectRatio: '16 / 9' }}
                >
                  Your browser does not support the video tag.
                </video>
              </div>
            ) : isAudio ? (
              <div className="flex h-full min-h-[320px] items-center justify-center p-6">
                <audio src={resolvedFileUrl} controls preload="metadata" className="w-full">
                  Your browser does not support the audio tag.
                </audio>
              </div>
            ) : isCsv ? (
              csvLoading ? (
                <div className="flex h-full min-h-[320px] items-center justify-center p-6">
                  <Loader size={40} description="Loading preview..." />
                </div>
              ) : csvError ? (
                <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 p-6">
                  <p className="text-body-md font-medium leading-[20px] tracking-body-md text-text-subheading text-center">
                    {csvError}
                  </p>
                  <Button
                    type="button"
                    variant="link"
                    onClick={() =>
                      window.open(resolvedFileUrl, '_blank', 'noopener,noreferrer')
                    }
                  >
                    Open file in new tab
                  </Button>
                </div>
              ) : (
                <div className="h-full min-h-[320px] overflow-auto">
                  {csvPreview?.headers.length ? (
                    <table className="w-full min-w-max border-separate border-spacing-0">
                      <thead className="sticky top-0 z-[1] bg-neutral-200">
                        <tr>
                          {csvPreview.headers.map((header, index) => (
                            <th
                              key={`${header}-${index}`}
                              className="border-b border-border-default px-3 py-2 text-left text-body-sm font-semibold leading-body-s tracking-body-sm text-text-heading"
                            >
                              {header || '—'}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {csvPreview.rows.map((row, rowIndex) => (
                          <tr key={`csv-row-${rowIndex}`}>
                            {row.map((cell, cellIndex) => (
                              <td
                                key={`csv-cell-${rowIndex}-${cellIndex}`}
                                className="border-b border-border-default px-3 py-2 text-body-sm font-normal leading-body-s tracking-body-sm text-text-body"
                              >
                                {cell?.trim() || '—'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="flex h-full min-h-[320px] items-center justify-center p-6">
                      <p className="text-body-md font-medium leading-[20px] tracking-body-md text-text-subheading text-center">
                        CSV file is empty.
                      </p>
                    </div>
                  )}
                </div>
              )
            ) : (
              <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 p-6">
                <p className="text-body-md font-medium leading-[20px] tracking-body-md text-text-subheading text-center">
                  Preview is not supported for this file type in-browser.
                </p>
                <Button
                  type="button"
                  variant="link"
                  onClick={() =>
                    window.open(resolvedFileUrl, '_blank', 'noopener,noreferrer')
                  }
                >
                  Open file in new tab
                </Button>
              </div>
            )
          ) : (
            <div className="flex h-full min-h-[320px] items-center justify-center p-6">
              <p className="text-body-md font-medium leading-[20px] tracking-body-md text-text-subheading text-center">
                Preview is unavailable right now.
              </p>
            </div>
          )}
        </div>
      </div>
    </DialogBox>
  );
}
