"use client";

import type { StaticImageData } from "next/image";
import type { HTMLAttributes } from "react";
import { cn } from "@/shared/lib/utils";

export interface SvgIconProps extends HTMLAttributes<HTMLSpanElement> {
  /** Result of `import icon from '…/file.svg'` (Next.js) or a public path string */
  src: string | StaticImageData;
  /** Accessible name when the icon is meaningful */
  alt?: string;
  /** Tailwind size (string like 5, 6) */
  size?: number | string;

  /** Tailwind class (text-*) or raw CSS color */
  color?: string;
}

/**
 * Renders an imported SVG as a tintable icon: uses the asset only as a **mask**
 * and paints with `currentColor`, so parent `text-*` classes (e.g. sidebar active
 * `text-text-link`) apply — unlike `<Image src={svg} />`, which cannot be recolored.
 *
 * Optional: pass `className` with `text-primary`, `text-icon-muted`, etc. to set color.
 */
export function SvgIcon({
  src,
  alt = "",
  size = 4,
  color,
  style,
  className,
  ...props
}: SvgIconProps) {
  const url = typeof src === "string" ? src : src.src;
  const sizeClass = `size-${size}`;
  const inlineSize =
    typeof size === "number"
      ? `${size * 4}px`
      : /^\d+(\.\d+)?$/.test(size)
        ? `${Number(size) * 4}px`
        : size;

  return (
    <span
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      className={cn(
        "inline-block shrink-0 bg-current",
        sizeClass,
        color,
        className,
      )}
      style={{
        width: inlineSize,
        height: inlineSize,
        WebkitMaskImage: `url("${url}")`,
        WebkitMaskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskImage: `url("${url}")`,
        maskSize: "contain",
        maskRepeat: "no-repeat",
        maskPosition: "center",
        ...style,
      }}
      {...props}
    />
  );
}
