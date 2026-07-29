'use client';

import { useCallback, useEffect, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import {
  Button,
  ButtonContainer,
  DialogBox,
  Divider,
  SvgIcon,
} from '@/shared/components/ui';
import rotateClockWiseIcon from '@/public/assets/icons/rotate-clock-wise/Rotate Clockwise=16px.svg';
import rotateAntiClockWiseIcon from '@/public/assets/icons/rotate-anti-clock-wise/Rotate Anti-Clockwise=16px.svg';

/**
 * Reusable crop / zoom / rotate editor that opens after a file is picked
 * and hands the edited image back to the parent for upload. Built on top
 * of `react-easy-crop` (industry-standard for avatar / logo editing) +
 * a small canvas read-back helper for Blob extraction.
 *
 * Shape-agnostic: pass `cropShape="round"` for avatars/logos or
 * `cropShape="rect"` for square/rectangular crops.
 */

export type ImageEditorSaveResult =
  | { kind: 'file'; file: File }
  | {
      kind: 'params';
      pixelCrop: Area;
      cropPercentages: Area;
      rotation: number;
      sourceDimensions: { width: number; height: number };
    };

interface ImageEditorDialogProps {
  open: boolean;
  /** Source file picked by the user. Mutually exclusive with `imageUrl`. */
  file?: File | null;
  /**
   * URL of an already-uploaded image to edit (used for re-cropping the
   * organization brand logo's immutable original). Mutually exclusive
   * with `file`.
   */
  imageUrl?: string | null;
  /** Crop overlay shape — round for avatars/logos, rect otherwise. */
  cropShape?: 'round' | 'rect';
  /** width / height aspect of the crop area. Default 1 (square). */
  aspect?: number;
  /** Header title shown in the dialog. */
  title?: string;
  /**
   * Pre-populated rotation when re-editing an existing image. Defaults
   * to 0 when omitted.
   */
  initialRotation?: number;
  /**
   * Restore a previously-saved crop. Coordinates are in the source
   * image's natural pixel dimensions (matches what `onSave` returns
   * in `params` mode). `react-easy-crop` derives the matching crop
   * offset and zoom internally so the editor opens with this exact
   * rectangle selected.
   */
  initialPixelCrop?: Area;
  /**
   * `'file'` (default) renders the cropped image in-browser via canvas
   * and hands a fresh File back to `onSave`. `'params'` skips the
   * canvas read-back and returns the crop rect + rotation for
   * server-side rendering.
   */
  outputMode?: 'file' | 'params';
  onCancel: () => void;
  onSave: (result: ImageEditorSaveResult) => void;
}

async function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = (event) => reject(event);
    image.crossOrigin = 'anonymous';
    image.src = src;
  });
}

async function cropImageToBlob(params: {
  imageSrc: string;
  pixelCrop: Area;
  rotationDegrees: number;
  outputMimeType: string;
}): Promise<Blob> {
  const { imageSrc, pixelCrop, rotationDegrees, outputMimeType } = params;
  const image = await loadHtmlImage(imageSrc);

  const rotationRadians = (rotationDegrees * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rotationRadians));
  const cos = Math.abs(Math.cos(rotationRadians));
  const rotatedWidth = image.width * cos + image.height * sin;
  const rotatedHeight = image.width * sin + image.height * cos;

  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = rotatedWidth;
  sourceCanvas.height = rotatedHeight;
  const sourceCtx = sourceCanvas.getContext('2d');
  if (!sourceCtx) throw new Error('2D canvas context unavailable');

  sourceCtx.translate(rotatedWidth / 2, rotatedHeight / 2);
  sourceCtx.rotate(rotationRadians);
  sourceCtx.drawImage(image, -image.width / 2, -image.height / 2);

  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = pixelCrop.width;
  outputCanvas.height = pixelCrop.height;
  const outputCtx = outputCanvas.getContext('2d');
  if (!outputCtx) throw new Error('2D canvas context unavailable');

  outputCtx.drawImage(
    sourceCanvas,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height,
  );

  return new Promise<Blob>((resolve, reject) => {
    outputCanvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to encode cropped image'));
          return;
        }
        resolve(blob);
      },
      outputMimeType,
      outputMimeType === 'image/jpeg' ? 0.92 : undefined,
    );
  });
}

function pickOutputMimeType(file: File): string {
  if (file.type === 'image/svg+xml') return 'image/png';
  if (file.type === 'image/jpeg') return 'image/jpeg';
  return 'image/png';
}

function deriveOutputFileName(file: File, outputMimeType: string): string {
  const lastDot = file.name.lastIndexOf('.');
  const stem = lastDot > 0 ? file.name.slice(0, lastDot) : file.name;
  const extension =
    outputMimeType === 'image/jpeg'
      ? 'jpg'
      : outputMimeType === 'image/png'
        ? 'png'
        : (file.name.split('.').pop() ?? 'png');
  return `${stem}.${extension}`;
}

export function ImageEditorDialog({
  open,
  file,
  imageUrl,
  cropShape = 'round',
  aspect = 1,
  title = 'Edit Image',
  initialRotation,
  initialPixelCrop,
  outputMode = 'file',
  onCancel,
  onSave,
}: ImageEditorDialogProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [targetRotation, setTargetRotation] = useState(initialRotation ?? 0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [croppedAreaPercentages, setCroppedAreaPercentages] =
    useState<Area | null>(null);
  const [naturalDimensions, setNaturalDimensions] = useState<
    { width: number; height: number } | null
  >(null);
  const [isSaving, setIsSaving] = useState(false);
  const minZoom: number = 1;
  const maxZoom: number = 4;

  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setImageSrc(url);
      // Crop offset and zoom reset; react-easy-crop will derive them from
      // `initialCroppedAreaPixels` if provided, then keep updating via
      // onCropChange / onZoomChange.
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setTargetRotation(initialRotation ?? 0);
      setCroppedAreaPixels(null);
      setCroppedAreaPercentages(null);
      setNaturalDimensions(null);
      return () => {
        URL.revokeObjectURL(url);
      };
    }

    if (imageUrl) {
      setImageSrc(imageUrl);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setTargetRotation(initialRotation ?? 0);
      setCroppedAreaPixels(null);
      setCroppedAreaPercentages(null);
      setNaturalDimensions(null);
      return;
    }

    setImageSrc(null);
  }, [file, imageUrl, initialRotation]);

  const handleCropAreaChange = useCallback(
    (croppedArea: Area, croppedPixels: Area) => {
      // Keep both the exact pixel crop (for editor restore) and the
      // percentage crop (for server-side replay across image decoders).
      setCroppedAreaPercentages(croppedArea);
      setCroppedAreaPixels(croppedPixels);
    },
    [],
  );

  const handleRotateLeft = () => setTargetRotation((current) => current - 90);
  const handleRotateRight = () => setTargetRotation((current) => current + 90);

  const handleSave = async () => {
    if (!imageSrc || !croppedAreaPixels || !croppedAreaPercentages) return;
    setIsSaving(true);
    try {
      if (outputMode === 'params') {
        if (!naturalDimensions) return;
        onSave({
          kind: 'params',
          pixelCrop: croppedAreaPixels,
          cropPercentages: croppedAreaPercentages,
          rotation: targetRotation,
          sourceDimensions: naturalDimensions,
        });
        return;
      }

      if (!file) return;
      const outputMimeType = pickOutputMimeType(file);
      const blob = await cropImageToBlob({
        imageSrc,
        pixelCrop: croppedAreaPixels,
        rotationDegrees: targetRotation,
        outputMimeType,
      });
      const editedFile = new File(
        [blob],
        deriveOutputFileName(file, outputMimeType),
        { type: outputMimeType, lastModified: Date.now() },
      );
      onSave({ kind: 'file', file: editedFile });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <DialogBox
      open={open}
      onClose={onCancel}
      placement="center"
      // 596px container with a 376×376 round crop mask — matches Figma.
      className="w-[596px]"
      footer={
        <ButtonContainer alignment="Right" configuration="With Padding">
          <Button variant="secondary" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={
              !croppedAreaPixels ||
              !croppedAreaPercentages ||
              isSaving ||
              (outputMode === 'params' && !naturalDimensions)
            }
            isLoading={isSaving}
          >
            Save
          </Button>
        </ButtonContainer>
      }
    >
      <div className="flex items-center justify-between border-b border-border-default p-5">
        <h3 className="text-[20px] font-semibold leading-body-l tracking-body-lg text-text-heading">
          {title}
        </h3>
      </div>

      <div className="relative h-[440px] w-full bg-neutral-200">
        {imageSrc ? (
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            rotation={targetRotation}
            aspect={aspect}
            cropShape={cropShape}
            initialCroppedAreaPixels={initialPixelCrop}
            cropSize={
              cropShape === 'round'
                ? { width: 376, height: 376 }
                : undefined
            }
            style={{
              mediaStyle: {
                transition: 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)',
              },
              cropAreaStyle: {
                boxShadow: '0 0 0 9999em rgba(15, 23, 42, 0.18)',
                border: 'none',
              },
            }}
            showGrid={false}
            minZoom={minZoom}
            maxZoom={maxZoom}
            zoomSpeed={0.5}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onRotationChange={setTargetRotation}
            onCropAreaChange={handleCropAreaChange}
            onCropComplete={handleCropAreaChange}
            onMediaLoaded={(media) => {
              setNaturalDimensions({
                width: media.naturalWidth,
                height: media.naturalHeight,
              });
            }}
          />
        ) : null}

        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-y-0 left-1/3 w-px bg-neutral-700/30" />
          <div className="absolute inset-y-0 left-2/3 w-px bg-neutral-700/30" />
          <div className="absolute inset-x-0 top-1/3 h-px bg-neutral-700/30" />
          <div className="absolute inset-x-0 top-2/3 h-px bg-neutral-700/30" />
        </div>
      </div>

      <div className="flex items-end justify-between gap-6 px-5 py-4">
        <div className="flex flex-1 flex-col gap-2.5">
          <label
            htmlFor="image-editor-zoom"
            className="text-body-md font-medium tracking-body-sm text-text-body"
          >
            Zoom
          </label>

          <input
            id="image-editor-zoom"
            type="range"
            min={minZoom}
            max={maxZoom}
            step={0.01}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            className="range-slider"
            style={
              {
                '--fill': `${maxZoom === minZoom ? 100 : ((zoom - minZoom) / (maxZoom - minZoom)) * 100}%`,
                height: '8px',
              } as React.CSSProperties
            }
          />
        </div>

        <Divider orientation="Vertical" emphasis="Low" className="h-8" />

        <div className="flex items-center gap-5">
          <button
            type="button"
            onClick={handleRotateLeft}
            aria-label="Rotate left 90 degrees"
            className="inline-flex items-center justify-center text-icon-default"
          >
            <SvgIcon
              src={rotateAntiClockWiseIcon}
              size={6}
              alt="Rotate left"
            />
          </button>
          <button
            type="button"
            onClick={handleRotateRight}
            aria-label="Rotate right 90 degrees"
            className="inline-flex items-center justify-center text-icon-default"
          >
            <SvgIcon
              src={rotateClockWiseIcon}
              size={6}
              alt="Rotate right"
            />
          </button>
        </div>
      </div>
    </DialogBox>
  );
}
