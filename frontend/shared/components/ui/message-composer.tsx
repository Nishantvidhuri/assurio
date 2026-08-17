'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import { useFilePreviewCache } from '@/shared/hooks/use-file-preview-cache';
import { cn } from '@/shared/lib/utils';
import {
  resolveAcceptedTypes,
  buildAcceptValue,
  validateFile as validateFileUtil,
} from '@/shared/utils/file-validation';
import { createPortal } from 'react-dom';
import { FileTypeIcon } from '@/shared/utils/file-type-icon';
import { FilePreviewDialog } from './file-preview-dialog';
import { inputBoxVariants } from './input-field';
import { Tooltip } from './tooltip';
import { toast } from './toast';
import { SvgIcon } from './svg-icon';
import closeIcon from '@/public/assets/icons/close-md/Close_MD=16px.svg'
import eyeIcon from '@/public/assets/icons/show/Show=16px.svg'
import paperClipIcon from '@/public/assets/icons/paper-clip-attechment-tilt/Paperclip_Attechment_Tilt=20px.svg'
import sendIcon from '@/public/assets/icons/paper-plane/Paper_Plane=20px.svg'

/* ─────────────────────────────────────────────────────────────────────
 *  MessageComposer
 *
 *  A generic text + file composer used for chat-style inputs like the
 *  Support chat. Combines a textarea, an attachment picker with
 *  drag-and-drop, and a send button in a single bordered container.
 *
 *  File validation (size + accepted types + image handling) mirrors the
 *  FileUploader component.
 * ───────────────────────────────────────────────────────────────────── */

export interface MessageComposerProps {
  /** Text value of the textarea (controlled). */
  value: string;
  onChange: (value: string) => void;

  /**
   * Optional send handler. When provided, a send button is rendered at the
   * bottom-right of the composer. Omit to hide the send button entirely
   * (useful when the parent handles submission via a separate button).
   */
  onSend?: () => void;

  /**
   * Whether sending is allowed. Only relevant when `onSend` is provided.
   */
  canSend?: boolean;

  placeholder?: string;
  disabled?: boolean;
  className?: string;

  /** Controlled list of attached files. */
  attachments?: File[];
  onAttachmentsChange?: (files: File[]) => void;

  /** Allow selecting / attaching multiple files at once. */
  multiple?: boolean;

  /** Accepted document types (same tokens as FileUploader). */
  acceptedDocumentTypes?: string[];

  /** Max allowed file size in megabytes. */
  maxFileSizeMb?: number;

  /** Allow image uploads in addition to documents. */
  allowImageUpload?: boolean;

  /** Minimum height of the textarea (in px). */
  minHeight?: number;

  /**
   * Fires whenever the internal file preview dialog opens or closes. The
   * parent can use this to suppress its own outside-click handlers while a
   * preview overlay is on screen.
   */
  onPreviewOpenChange?: (isOpen: boolean) => void;
}

export function MessageComposer({
  value,
  onChange,
  onSend,
  canSend = true,
  placeholder = 'Type your message...',
  disabled = false,
  className,
  attachments = [],
  onAttachmentsChange,
  multiple = false,
  acceptedDocumentTypes = ['PDF', 'DOC', 'DOCX', 'PNG', 'JPG', 'JPEG'],
  maxFileSizeMb = 10,
  allowImageUpload = true,
  onPreviewOpenChange,
}: MessageComposerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [attachTooltipRect, setAttachTooltipRect] = useState<DOMRect | null>(null);
  const [removeTooltip, setRemoveTooltip] = useState<{
    index: number;
    rect: DOMRect;
  } | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const previewUrl = useFilePreviewCache(previewFile);
  const isPreviewOpen = previewFile !== null;

  useEffect(() => {
    onPreviewOpenChange?.(isPreviewOpen);
  }, [isPreviewOpen, onPreviewOpenChange]);

  const resolved = useMemo(
    () => resolveAcceptedTypes(acceptedDocumentTypes),
    [acceptedDocumentTypes],
  );

  const acceptValue = useMemo(
    () =>
      buildAcceptValue(
        resolved.documentExtensions,
        allowImageUpload,
        resolved.allowedImageExtensions,
        resolved.allowedImageMimeTypes,
      ),
    [allowImageUpload, resolved],
  );

  const validateFile = (file: File): string | null =>
    validateFileUtil(file, {
      maxFileSizeMb,
      normalizedDocTypes: resolved.normalizedDocTypes,
      documentExtensions: resolved.documentExtensions,
      allowImageUpload,
      allowedImageExtensions: resolved.allowedImageExtensions,
      allowedImageMimeTypes: resolved.allowedImageMimeTypes,
    });

  const handleFileSelection = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) {
      return;
    }

    const validFiles: File[] = [];

    for (const file of Array.from(fileList)) {
      const error = validateFile(file);
      if (error) {
        toast.error('Upload failed', { description: error });
        continue;
      }
      validFiles.push(file);
      if (!multiple) {
        break;
      }
    }

    if (validFiles.length === 0) {
      return;
    }

    const nextAttachments = multiple
      ? [...attachments, ...validFiles]
      : validFiles;
    onAttachmentsChange?.(nextAttachments);
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleFileSelection(event.target.files);
    event.target.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (disabled) {
      return;
    }
    setDragActive(false);
    handleFileSelection(event.dataTransfer.files);
  };

  const handleRemoveAttachment = (index: number) => {
    const next = attachments.filter((_, i) => i !== index);
    onAttachmentsChange?.(next);
  };

  const renderAttachmentIcon = (file: File) => (
    <FileTypeIcon filename={file.name} width={20} height={24} />
  );

  const composerState = disabled ? 'disabled' : 'default';
  const hasAttachments = attachments.length > 0;
  const sendDisabled = disabled || !canSend;

  return (
    <div className={cn('flex flex-col', className)}>
    <div
      className={cn(
        inputBoxVariants({ state: composerState }),
        'flex-col items-stretch gap-0 overflow-x-hidden overflow-y-hidden rounded-lg p-0',
        hasAttachments ? 'h-[176px]' : 'h-[136px]',
        dragActive && !disabled && 'border-border-focused!',
      )}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) {
          setDragActive(true);
        }
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept={acceptValue}
        multiple={multiple}
        className="hidden"
        onChange={handleInputChange}
        disabled={disabled}
      />

      {attachments.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto overflow-y-hidden px-3 pt-3 pb-1 hide-scrollbar">
          {attachments.map((file, index) => (
            <div
              key={`${file.name}-${file.lastModified}-${index}`}
              className="flex w-[190px] shrink-0 items-center justify-between gap-3 rounded-lg border border-border-default bg-neutral-200 p-3"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {renderAttachmentIcon(file)}
                <span className="min-w-0 flex-1 truncate text-body-sm font-medium text-text-body">
                  {file.name}
                </span>
              </div>
              <button
                type="button"
                aria-label={`Preview ${file.name}`}
                className="inline-flex size-4 items-center justify-center text-icon-default transition-colors hover:text-text-body"
                onClick={() => setPreviewFile(file)}
              >
                <SvgIcon src={eyeIcon} size={3.5} alt='Show' />
              </button>
              {!disabled ? (
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  className="inline-flex size-4 items-center justify-center text-icon-default transition-colors hover:text-failure"
                  onClick={(event) => {
                    setRemoveTooltip(null);
                    handleRemoveAttachment(index);
                    event.currentTarget.blur();
                  }}
                  onMouseEnter={(event) =>
                    setRemoveTooltip({
                      index,
                      rect: event.currentTarget.getBoundingClientRect(),
                    })
                  }
                  onMouseLeave={() =>
                    setRemoveTooltip((current) =>
                      current?.index === index ? null : current,
                    )
                  }
                  onFocus={(event) =>
                    setRemoveTooltip({
                      index,
                      rect: event.currentTarget.getBoundingClientRect(),
                    })
                  }
                  onBlur={() =>
                    setRemoveTooltip((current) =>
                      current?.index === index ? null : current,
                    )
                  }
                >
                  <SvgIcon src={closeIcon} size={3.5} alt="Close" />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <textarea
        id="message-composer-input"
        name="message-composer-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          'flex-1 min-w-0 w-full bg-transparent outline-none resize-none overflow-y-auto px-3 pt-3',
          'text-body-md font-normal leading-[20px] tracking-body-md',
          'text-neutral-800 placeholder:text-neutral-600',
          disabled && 'cursor-not-allowed',
        )}
      />
      

      <div className="flex shrink-0 items-center justify-between px-3 pb-3">
        <button
          type="button"
          disabled={disabled}
          aria-label="Attach file"
          className="inline-flex size-9 items-center justify-center rounded-full bg-neutral-200 text-text-body transition-colors hover:bg-neutral-300 disabled:pointer-events-none disabled:opacity-50"
          onClick={() => inputRef.current?.click()}
          onMouseEnter={(event) =>
            setAttachTooltipRect(event.currentTarget.getBoundingClientRect())
          }
          onMouseLeave={() => setAttachTooltipRect(null)}
          onFocus={(event) =>
            setAttachTooltipRect(event.currentTarget.getBoundingClientRect())
          }
          onBlur={() => setAttachTooltipRect(null)}
        >
          <SvgIcon src={paperClipIcon} size={5} alt='Paper Clip' />
        </button>

        {onSend ? (
          <button
            type="button"
            disabled={sendDisabled}
            aria-label="Send"
            className={cn(
              'inline-flex size-9 items-center justify-center rounded-full transition-colors',
              sendDisabled
                ? 'bg-neutral-400 text-text-disabled cursor-not-allowed'
                : 'bg-navy-400 text-white hover:opacity-90',
            )}
            onClick={() => {
              if (sendDisabled) {
                return;
              }
              onSend();
            }}
          >
            <SvgIcon src={sendIcon} size={5} alt='Send' />
          </button>
        ) : null}
      </div>

      <FilePreviewDialog
        open={previewFile !== null}
        onClose={() => setPreviewFile(null)}
        file={previewFile}
        fileUrl={previewUrl}
      />
    </div>

    {attachTooltipRect
      ? createPortal(
          <div
            className="pointer-events-none fixed z-[100]"
            style={{
              bottom: window.innerHeight - attachTooltipRect.top + 4,
              left: attachTooltipRect.left,
            }}
          >
            <Tooltip
              variant="basic"
              text="Attachment Type : PDF, DOC, DOCS, PNG, JPG, JPEG (Max size: 10MB)"
              position="top-left"
              className="text-caption px-2 py-1"
            />
          </div>,
          document.body,
        )
      : null}
    {removeTooltip
      ? createPortal(
          <div
            className="pointer-events-none fixed z-[100]"
            style={{
              bottom: window.innerHeight - removeTooltip.rect.top + 4,
              left: removeTooltip.rect.left + removeTooltip.rect.width / 2,
              transform: 'translateX(-50%)',
            }}
          >
            <Tooltip
              variant="basic"
              position="top-center"
              text="Remove file"
              className="text-caption px-2 py-1"
            />
          </div>,
          document.body,
        )
      : null}
    </div>
  );
}
