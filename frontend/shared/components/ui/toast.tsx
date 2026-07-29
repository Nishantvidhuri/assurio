'use client';

import { Toaster as SonnerToaster } from 'sonner';
export { toast } from 'sonner';
import { SvgIcon } from './svg-icon';
import closeIcon from '@/public/assets/icons/close-md/Close_MD=16px.svg'


/**
 * RDS Toaster — wraps Sonner's `<Toaster>` with project-wide defaults.
 *
 * Positioned: bottom-center, 40px from the viewport bottom.
 * Styled to match the RDS Toast (Figma 3152:2358) via `toastOptions.classNames`.
 *
 * Usage:
 *   Place `<Toaster />` once in the root layout.
 *   Fire toasts anywhere with `import { toast } from '@/shared/components/ui'`.
 *
 * @example
 * ```ts
 * toast.success('Changes saved');
 * toast.error('Upload failed', { description: 'File too large' });
 * toast('Something happened');
 * ```
 */
export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-center"
      offset={40}
      closeButton
      icons={{
        close: <SvgIcon src={closeIcon} size={4} alt="Close" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: [
            'flex items-center gap-6 w-full max-w-[1000px] overflow-hidden',
            'pl-6 pr-3 py-3 rounded-md',
            'shadow-[0px_0.8px_6px_0px_rgba(11,26,59,0.05)]',
            'bg-white border border-border-default text-text-body',
            'font-sans',
          ].join(' '),
          title: 'text-body-md font-medium leading-[20px] tracking-body-md',
          description:
            'text-body-sm font-medium leading-[20px] tracking-body-sm text-current opacity-90',
          actionButton:
            'text-body-sm font-medium text-primary hover:underline',
          cancelButton:
            'text-body-sm font-medium text-text-subheading hover:underline',
          closeButton:
            '!static !transform-none !right-auto !top-auto !left-auto !order-last ml-auto shrink-0 !bg-transparent !border-0 !shadow-none !p-0 !size-4 hover:!opacity-80 [&_svg]:!text-current [&_svg_path]:!fill-current',

          success: '!bg-success !text-white !border-0',
          error: '!bg-failure !text-white !border-0',
          warning: '!bg-warning !text-white !border-0',
          info: '!bg-primary !text-white !border-0',
        },
      }}
    />
  );
}
