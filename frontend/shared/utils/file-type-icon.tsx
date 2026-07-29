import Image from 'next/image';
import { FileText } from 'lucide-react';
import pdfIcon from '@/public/assets/icons/file-type/PDF.svg';
import csvIcon from '@/public/CSV.svg';
import imageIcon from '@/public/assets/icons/file-type/JPG.svg';

export interface FileTypeIconProps {
  filename: string;
  width?: number;
  height?: number;
  className?: string;
}

function getFileExtension(filename: string): string {
  return (filename.split('.').pop() ?? '').toLowerCase();
}

/**
 * Renders a file-type specific icon based on the filename extension.
 * - PDF, JPG/JPEG/PNG/WEBP/SVG, CSV → dedicated SVG icon
 * - All other types → generic FileText icon
 */
export function FileTypeIcon({
  filename,
  width = 20,
  height = 24,
  className,
}: FileTypeIconProps) {
  const ext = getFileExtension(filename);

  if (ext === 'csv') {
    return (
      <Image
        src={csvIcon}
        alt="CSV file"
        width={width}
        height={height}
        className={className}
      />
    );
  }

  if (ext === 'pdf') {
    return (
      <Image
        src={pdfIcon}
        alt="PDF file"
        width={width}
        height={height}
        className={className}
      />
    );
  }

  if (['jpg', 'jpeg', 'png', 'webp', 'svg'].includes(ext)) {
    return (
      <Image
        src={imageIcon}
        alt="Image file"
        width={width}
        height={height}
        className={className}
      />
    );
  }

  return <FileText className="size-5 shrink-0 text-icon-muted" />;
}
