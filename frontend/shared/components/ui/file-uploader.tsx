/* eslint-disable @next/next/no-img-element */
'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import Image from 'next/image';
import { FileImage, FileText, Plus } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useFilePreviewCache } from '@/shared/hooks/use-file-preview-cache';
import { useIsMobileOrTablet } from '@/shared/hooks/use-media-query';
import {
  resolveAcceptedTypes,
  buildAcceptValue,
  validateFile as validateFileUtil,
} from '@/shared/utils/file-validation';
import { FilePreviewDialog } from './file-preview-dialog';
import { Tooltip } from './tooltip';
import { toast } from './toast';
import cloudUploadIcon from '@/public/assets/icons/cloud-upload/Cloud_Upload=24px.svg'
import { SvgIcon } from './svg-icon';
import showIcon from '@/public/assets/icons/show/Show=16px.svg'
import trashFullIcon from '@/public/assets/icons/trash-full/Trash_Full=24px.svg'
import closeIcon from '@/public/assets/icons/close-md/Close_MD=16px.svg'

type UploadedKind = 'document' | 'image';

type SizeValue = number | string | 'auto';

function resolveSize(value: SizeValue): string {
  if (value === 'auto') return 'auto';
  if (typeof value === 'number') return `${value}px`;
  return value;
}

export interface FileUploaderProps {
  value?: File | null;
  defaultValue?: File | null;
  existingUploadedFile?: {
    name: string;
    url?: string | null;
    inlineImageUrl?: string | null;
    mimeType?: string | null;
    previewFile?: File | null;
  } | null;
  requestExistingFilePreview?: () => Promise<{
    downloadUrl: string;
    mimeType?: string | null;
  }>;
  onChange?: (file: File | null) => void;
  onRemoveExistingUploadedFile?: () => void;
  onError?: (message: string) => void;
  className?: string;
  disabled?: boolean;
  uploadSubject?: string;
  acceptedDocumentTypes?: string[];
  maxFileSizeMb?: number;
  allowImageUpload?: boolean;
  clickToUploadText?: string;
  dragAndDropText?: string;
  highlighted?: boolean;
  promptTone?: 'default' | 'muted';
  width?: SizeValue;
  height?: SizeValue;
  containerClassName?: string;
}

/**
 * RDS FileUploader — Figma nodes 3755:1637, 3756:2059, 3756:2023.
 *
 * Supports:
 * - Drag-and-drop + click-to-upload
 * - Configurable document extensions and max size
 * - Document/image uploaded states
 * - Centered document preview with DialogBox
 */
export function FileUploader({
  value,
  defaultValue = null,
  existingUploadedFile = null,
  requestExistingFilePreview,
  onChange,
  onRemoveExistingUploadedFile,
  onError,
  className,
  disabled = false,
  uploadSubject = 'resume',
  acceptedDocumentTypes = ['PDF', 'DOC', 'DOCX', 'CSV'],
  maxFileSizeMb = 10,
  allowImageUpload = true,
  clickToUploadText = 'Click to upload',
  dragAndDropText,
  highlighted = false,
  promptTone = 'default',
  width = 308,
  height = 'auto',
  containerClassName,
}: FileUploaderProps) {
  const isControlled = value !== undefined;
  const [internalFile, setInternalFile] = useState<File | null>(defaultValue);
  const [dragActive, setDragActive] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [inlineImageLoadFailed, setInlineImageLoadFailed] = useState(false);
  const [requestedPreviewUrl, setRequestedPreviewUrl] = useState<string | null>(null);
  const [requestedPreviewMimeType, setRequestedPreviewMimeType] = useState<string | null>(null);
  const [showPreviewTooltipFor, setShowPreviewTooltipFor] = useState<'document' | null>(null);
  // Mobile/tablet has no hover — tapping the uploaded image toggles the
  // View / Remove actions overlay instead.
  const [imageActionsOpen, setImageActionsOpen] = useState(false);
  const isMobileOrTablet = useIsMobileOrTablet();
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedFile = isControlled ? value ?? null : internalFile;
  const uploaderWidthStyle = useMemo(
    () => ({
      width: resolveSize(width),
    }),
    [width],
  );
  const uploaderPromptStyle = useMemo(
    () => ({
      width: resolveSize(width),
      ...(height === 'auto'
        ? {}
        : {
            minHeight: resolveSize(height),
          }),
    }),
    [height, width],
  );
  const uploadedImageContainerStyle = useMemo(
    () => ({
      width: resolveSize(width),
      ...(height === 'auto' ? {} : { minHeight: resolveSize(height) }),
    }),
    [height, width],
  );

  const resolved = useMemo(
    () => resolveAcceptedTypes(acceptedDocumentTypes),
    [acceptedDocumentTypes],
  );
  const { normalizedDocTypes, documentExtensions, allowedImageExtensions, allowedImageMimeTypes } = resolved;

  const acceptValue = useMemo(
    () =>
      buildAcceptValue(
        documentExtensions,
        allowImageUpload,
        allowedImageExtensions,
        allowedImageMimeTypes,
      ),
    [allowImageUpload, allowedImageExtensions, allowedImageMimeTypes, documentExtensions],
  );

  const subtext = useMemo(
    () => `${normalizedDocTypes.join(', ')} (Max File size: ${maxFileSizeMb} MB)`,
    [maxFileSizeMb, normalizedDocTypes],
  );
  const resolvedDragAndDropText = dragAndDropText ?? `or drag and drop ${uploadSubject}`;

  const previewUrl = useFilePreviewCache(selectedFile);
  const existingPreviewFile = existingUploadedFile?.previewFile ?? null;
  const existingPreviewUrl = useFilePreviewCache(existingPreviewFile);
  const resolvedExistingFileUrl = existingUploadedFile?.url ?? null;
  const resolvedExistingInlineImageUrl = existingUploadedFile?.inlineImageUrl ?? null;
  const resolvedExistingFileName = existingUploadedFile?.name ?? '';
  const resolvedExistingMimeType =
    existingUploadedFile?.mimeType ?? existingPreviewFile?.type ?? '';
  const resolvedPreviewUrl =
    requestedPreviewUrl ?? resolvedExistingFileUrl ?? existingPreviewUrl;
  const hasUploadedFile = Boolean(selectedFile || existingUploadedFile);

  const extension =
    selectedFile?.name.split('.').pop()?.toLowerCase() ??
    existingPreviewFile?.name.split('.').pop()?.toLowerCase() ??
    resolvedExistingFileName.split('.').pop()?.toLowerCase() ??
    '';
  const uploadedKind: UploadedKind | null = selectedFile
    ? selectedFile.type.startsWith('image/')
      ? 'image'
      : 'document'
    : existingUploadedFile
      ? (existingPreviewFile?.type ?? resolvedExistingMimeType).startsWith('image/')
        ? 'image'
        : 'document'
      : null;
  const displayedFileName =
    selectedFile?.name ||
    resolvedExistingFileName ||
    existingPreviewFile?.name ||
    '';
  const uploadedImagePreviewUrl = selectedFile
    ? previewUrl
    : existingPreviewUrl ?? resolvedExistingInlineImageUrl;
  const hasPreview = Boolean(
    selectedFile ||
      existingPreviewFile ||
      requestExistingFilePreview ||
      resolvedPreviewUrl,
  );

  useEffect(() => {
    setRequestedPreviewUrl(null);
    setRequestedPreviewMimeType(null);
  }, [
    selectedFile,
    existingPreviewFile,
    resolvedExistingFileName,
    resolvedExistingFileUrl,
    resolvedExistingInlineImageUrl,
    resolvedExistingMimeType,
  ]);

  useEffect(() => {
    setInlineImageLoadFailed(false);
  }, [uploadedImagePreviewUrl]);

  const setFile = (file: File | null) => {
    if (disabled) return;
    if (!isControlled) setInternalFile(file);
    onChange?.(file);
  };

  const validateFile = (file: File): string | null =>
    validateFileUtil(file, {
      maxFileSizeMb,
      normalizedDocTypes,
      documentExtensions,
      allowImageUpload,
      allowedImageExtensions,
      allowedImageMimeTypes,
    });

  const showUploadError = (message: string) => {
    toast.error('Upload failed', { description: message });
    onError?.(message);
  };

  const handleIncomingFile = (file: File | null) => {
    if (!file) return;
    const error = validateFile(file);
    if (error) {
      showUploadError(error);
      return;
    }
    setFile(file);
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    handleIncomingFile(file);
    event.target.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (disabled) return;
    setDragActive(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    handleIncomingFile(file);
  };

  const handlePreviewOpen = async () => {
    if (disabled || previewLoading) {
      return;
    }

    if (selectedFile || existingPreviewFile) {
      setPreviewOpen(true);
      return;
    }

    if (requestExistingFilePreview) {
      try {
        setRequestedPreviewUrl(null);
        setRequestedPreviewMimeType(null);
        setPreviewOpen(true);
        setPreviewLoading(true);
        const preview = await requestExistingFilePreview();
        setRequestedPreviewUrl(preview.downloadUrl);
        setRequestedPreviewMimeType(preview.mimeType ?? resolvedExistingMimeType ?? null);
        return;
      } catch (error) {
        setPreviewOpen(false);
        const message =
          error instanceof Error
            ? error.message
            : 'Preview is unavailable right now.';
        toast.error('Preview unavailable', {
          description: message,
        });
        return;
      } finally {
        setPreviewLoading(false);
      }
    }

    if (resolvedPreviewUrl) {
      setPreviewOpen(true);
    }
  };

  const dropAreaClasses = cn(
    // No `h-full` — a percentage height would resolve to auto against the
    // auto-height wrapper and defeat the flex stretch that fills the
    // uploader's reserved min-height.
    'w-full rounded-lg border-2 border-dashed bg-white transition-colors',
    dragActive || highlighted ? 'border-border-focused' : 'border-neutral-600',
    disabled && 'pointer-events-none opacity-50',
  );

  const renderUploadPrompt = (focused: boolean) => (
    <div
      className={cn(
        dropAreaClasses,
        focused && 'border-border-focused',
        'relative flex items-center justify-center p-6',
        containerClassName
      )}
    >
      {/* Drag-over overlay — shown only while a file is being dragged over */}
      {dragActive && !disabled ? (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[12px]"
          style={{ backgroundColor: 'rgba(23, 74, 181, 0.40)' }}
        >
          <Plus className="size-10 text-white" strokeWidth={2.5} />
        </div>
      ) : null}

      <div className="flex flex-col items-center gap-4">
        <div className={cn('inline-flex items-center justify-center rounded-full p-3 aspect-square', focused ? 'bg-primary-200' : 'bg-surface-disabled')}>
          <SvgIcon src={cloudUploadIcon} size={6} color='text-primary' alt='Cloud' />
        </div>

        <div className="flex flex-col items-center gap-1">
          <div className="flex items-start justify-center gap-0.75">
            <button
              type="button"
              className={cn(
                'min-h-0 p-0 text-body-md font-medium! leading-[20px] tracking-body-md',
                promptTone === 'muted'
                  ? 'text-text-disabled'
                  : 'text-text-link hover:text-accent-700 hover:underline',
              )}
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
            >
              {clickToUploadText}
            </button>
            <p
              className={cn(
                'text-[14px] font-medium leading-[20px] tracking-body-md',
                promptTone === 'muted' ? 'text-text-disabled' : 'text-text-body',
              )}
            >
              {resolvedDragAndDropText}
            </p>
          </div>

          <p
            className={cn(
              'text-[12px] font-medium leading-[20px] tracking-body-sm',
              promptTone === 'muted'
                ? 'text-text-disabled'
                : focused
                  ? 'text-text-subheading'
                  : 'text-text-disabled',
            )}
          >
            {subtext}
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className={cn(
        'relative flex flex-col',
        hasUploadedFile ? undefined : className,
      )}
      onDragEnter={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!disabled) setDragActive(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!disabled) setDragActive(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        event.stopPropagation();
        // Only clear when actually leaving the uploader — not when entering children
        const related = event.relatedTarget as Node | null;
        if (!related || !event.currentTarget.contains(related)) {
          setDragActive(false);
        }
      }}
      onDrop={(event) => {
        setDragActive(false);
        handleDrop(event);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={acceptValue}
        className="hidden"
        onChange={handleInputChange}
        disabled={disabled}
      />

      {/* `flex` on the wrapper so the dashed drop area stretches to the
          reserved min-height instead of sitting at its content height and
          leaving dead space below the border. */}
      {!selectedFile && !existingUploadedFile ? (
        <div className="flex min-h-0 flex-1" style={uploaderPromptStyle}>
          {renderUploadPrompt(dragActive || highlighted)}
        </div>
      ) : null}

      {uploadedKind === 'image' ? (
        <div
          className={cn(
            'group relative flex items-center justify-center rounded-lg border-2 border-dashed border-border-focused bg-white p-6',
          )}
          style={uploadedImageContainerStyle}
          // Mobile/tablet: tap toggles the actions overlay (no hover).
          onClick={
            isMobileOrTablet && !disabled
              ? () => setImageActionsOpen((open) => !open)
              : undefined
          }
        >
          <div className="flex flex-col items-center gap-2">
            {uploadedImagePreviewUrl && !inlineImageLoadFailed ? (
              <div className="relative h-[100px] w-[200px] overflow-hidden">
                <img
                  src={uploadedImagePreviewUrl}
                  alt={displayedFileName || `${uploadSubject} image`}
                  className="size-full object-cover"
                  onError={() => setInlineImageLoadFailed(true)}
                />
              </div>
            ) : (
              <div className="flex h-[100px] w-[200px] items-center justify-center rounded-sm bg-surface-disabled text-icon-muted">
                <FileImage className="size-10" />
              </div>
            )}
            {displayedFileName ? (
              <p className="text-body-md font-medium leading-[20px] tracking-body-md text-text-body">
                {displayedFileName}
              </p>
            ) : null}
          </div>

          {!disabled ? (
            <div
              className={cn(
                'absolute inset-[-2px] rounded-lg bg-white/85 group-hover:flex group-focus-within:flex',
                'items-center justify-center',
                // Desktop reveals on hover; mobile/tablet on tap.
                imageActionsOpen ? 'flex' : 'hidden',
              )}
            >
              <div className="flex items-center justify-between w-[142px]">
                {hasPreview ? (
                  <button
                    type="button"
                    aria-label="View image"
                    className="flex flex-col items-center gap-1 text-text-link hover:text-accent-700 disabled:pointer-events-none disabled:opacity-50"
                    disabled={previewLoading}
                    onClick={(event) => {
                      event.stopPropagation();
                      void handlePreviewOpen();
                    }}
                  >
                    <SvgIcon src={showIcon} size={6} color="text-current" alt="View" />
                    <span className="text-body-md font-medium leading-[20px] tracking-body-md text-current">
                      View
                    </span>
                  </button>
                ) : (
                  <div />
                )}

                <button
                  type="button"
                  aria-label="Remove image"
                  className="flex flex-col items-center gap-1 text-text-error hover:text-failure"
                  onClick={(event) => {
                    event.stopPropagation();
                    setImageActionsOpen(false);
                    if (selectedFile) {
                      setFile(null);
                      return;
                    }

                    onRemoveExistingUploadedFile?.();
                  }}
                >
                  <SvgIcon src={trashFullIcon} size={6} color="text-current" alt="Remove" />
                  <span className="text-body-md font-medium leading-[20px] tracking-body-md text-current">
                    Remove
                  </span>
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {hasUploadedFile && uploadedKind === 'document' ? (
        <div className="flex flex-col items-center gap-3" style={uploaderWidthStyle}>
          <div className="w-full" style={{ width: resolveSize(width) }}>
            {renderUploadPrompt(true)}
          </div>

          <div className="flex w-full items-center justify-between rounded-md border border-border-default bg-neutral-200 p-3">
            <div className="flex items-center gap-1">
              {extension === 'csv' ? (
                <Image
                  src="/CSV.svg"
                  alt="CSV file"
                  width={24}
                  height={24}
                  className="size-7"
                />
              ) : extension === 'pdf' ? (
                <FileText className="size-5 text-failure" />
              ) : (
                <FileImage className="size-5 text-icon-muted" />
              )}
              <p className="text-body-md font-medium leading-[20px] tracking-body-md text-text-body">
                {displayedFileName}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {hasPreview ? (
                <div
                  className="relative inline-flex"
                  onMouseEnter={() => setShowPreviewTooltipFor('document')}
                  onMouseLeave={() => setShowPreviewTooltipFor(null)}
                >
                  <button
                  type="button"
                  aria-label="Preview file"
                  disabled={disabled || previewLoading}
                  className="inline-flex size-4 items-center justify-center text-icon-default hover:text-text-body disabled:pointer-events-none disabled:opacity-50"
                  onClick={() => {
                    void handlePreviewOpen();
                  }}
                  onFocus={() => setShowPreviewTooltipFor('document')}
                  onBlur={() => setShowPreviewTooltipFor(null)}
                  >
                    <SvgIcon src={showIcon} alt='Show' />
                  </button>
                  {showPreviewTooltipFor === 'document' ? (
                    <Tooltip
                      variant="basic"
                      position="top-center"
                      text="Preview file"
                      width={113}
                      className="absolute bottom-full left-1/2 z-10 -translate-x-1/2 mb-1"
                    />
                  ) : null}
                </div>
              ) : null}
              <button
                type="button"
                aria-label="Remove file"
                disabled={disabled}
                className="inline-flex size-4 items-center justify-center text-icon-default hover:text-failure disabled:pointer-events-none disabled:opacity-50"
                onClick={() => {
                  if (selectedFile) {
                    setFile(null);
                    return;
                  }

                  onRemoveExistingUploadedFile?.();
                }}
              >
                <SvgIcon src={closeIcon} alt='Close' />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <FilePreviewDialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        file={selectedFile ?? existingPreviewFile}
        fileUrl={selectedFile ? previewUrl : resolvedPreviewUrl}
        isLoading={previewLoading}
        fileName={selectedFile ? undefined : displayedFileName}
        mimeType={selectedFile ? undefined : (requestedPreviewMimeType ?? resolvedExistingMimeType)}
      />
    </div>
  );
}
