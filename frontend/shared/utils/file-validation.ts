/**
 * Shared file validation utilities used by FileUploader and MessageComposer.
 *
 * Centralises accepted-type constants, MIME normalization, and the core
 * validate-file logic so both components stay in sync.
 */

export const KNOWN_DOC_EXTENSIONS: Record<string, string> = {
  PDF: '.pdf',
  DOC: '.doc',
  DOCX: '.docx',
  CSV: '.csv',
};

export const KNOWN_IMAGE_TYPES: Record<
  string,
  { extensions: string[]; mimeTypes: string[] }
> = {
  PNG: {
    extensions: ['.png'],
    mimeTypes: ['image/png'],
  },
  JPG: {
    extensions: ['.jpg', '.jpeg'],
    mimeTypes: ['image/jpeg'],
  },
  JPEG: {
    extensions: ['.jpg', '.jpeg'],
    mimeTypes: ['image/jpeg'],
  },
  WEBP: {
    extensions: ['.webp'],
    mimeTypes: ['image/webp'],
  },
};

export function normalizeMimeType(rawMimeType: string): string {
  const normalizedMimeType = rawMimeType.trim().toLowerCase();

  if (normalizedMimeType === 'image/jpg') {
    return 'image/jpeg';
  }

  return normalizedMimeType;
}

/**
 * Derives the resolved extension list, image extension list, and image
 * MIME list from a set of accepted document type tokens (e.g. ['PDF', 'PNG']).
 */
export function resolveAcceptedTypes(acceptedDocumentTypes: string[]) {
  const normalizedDocTypes = acceptedDocumentTypes
    .map((type) => type.trim().toUpperCase())
    .filter(Boolean);

  const documentExtensions = normalizedDocTypes.map(
    (type) => KNOWN_DOC_EXTENSIONS[type] ?? `.${type.toLowerCase()}`,
  );

  const allowedImageTypes = normalizedDocTypes
    .map((type) => KNOWN_IMAGE_TYPES[type])
    .filter(Boolean);

  const allowedImageExtensions = Array.from(
    new Set(allowedImageTypes.flatMap((type) => type.extensions)),
  );

  const allowedImageMimeTypes = Array.from(
    new Set(allowedImageTypes.flatMap((type) => type.mimeTypes)),
  );

  return {
    normalizedDocTypes,
    documentExtensions,
    allowedImageExtensions,
    allowedImageMimeTypes,
  };
}

/**
 * Builds the `accept` attribute value for an `<input type="file">`.
 */
export function buildAcceptValue(
  documentExtensions: string[],
  allowImageUpload: boolean,
  allowedImageExtensions: string[],
  allowedImageMimeTypes: string[],
): string {
  const tokens = [...documentExtensions];
  if (allowImageUpload) {
    tokens.push(...allowedImageExtensions, ...allowedImageMimeTypes);
  }
  return Array.from(new Set(tokens)).join(',');
}

/**
 * Validates a single file against accepted types and max size.
 * Returns an error message string, or `null` if the file is valid.
 */
export function validateFile(
  file: File,
  options: {
    maxFileSizeMb: number;
    normalizedDocTypes: string[];
    documentExtensions: string[];
    allowImageUpload: boolean;
    allowedImageExtensions: string[];
    allowedImageMimeTypes: string[];
  },
): string | null {
  const maxBytes = options.maxFileSizeMb * 1024 * 1024;
  if (file.size > maxBytes) {
    return `Maximum file size is ${options.maxFileSizeMb} MB.`;
  }

  const fileExt = `.${(file.name.split('.').pop() ?? '').toLowerCase()}`;
  const normalizedMime = normalizeMimeType(file.type);

  const isAllowedDocument = options.documentExtensions.some(
    (ext) => ext.toLowerCase() === fileExt,
  );

  if (
    options.allowImageUpload &&
    (fileExt === '.svg' || normalizedMime === 'image/svg+xml')
  ) {
    return `Unsupported file type. Allowed: ${options.normalizedDocTypes.join(', ')}`;
  }

  const isAllowedImage =
    options.allowImageUpload &&
    (options.allowedImageExtensions.includes(fileExt) ||
      options.allowedImageMimeTypes.includes(normalizedMime));

  if (!isAllowedDocument && !isAllowedImage) {
    return `Unsupported file type. Allowed: ${options.normalizedDocTypes.join(', ')}`;
  }

  return null;
}
