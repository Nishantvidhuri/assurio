import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        {
          text: [
            'display-1',
            'display-2',
            'h1',
            'h2',
            'h3',
            'h4',
            'body-lg',
            'body-md',
            'body-sm',
            'subtitle-md',
            'subtitle-sm',
            'link',
            'caption',
            'input-label',
            'placeholder',
          ],
        },
      ],
    },
  },
});

/**
 * Merges Tailwind CSS class names intelligently.
 * Combines clsx (conditional classes) with tailwind-merge (deduplication).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

