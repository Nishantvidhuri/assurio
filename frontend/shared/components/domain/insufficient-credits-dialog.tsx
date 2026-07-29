'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Button, ButtonContainer, DialogBox } from '@/shared/components/ui';
import { useAuthSession } from '@/modules/auth/commons/auth-session.context';

const CREDITS_TOPUP_HREF = '/dashboard/client/credits';

interface InsufficientCreditsDialogProps {
  open: boolean;
  onClose: () => void;
  shortfall: number;
  actionDescription?: string;
  onAddCredits?: () => void;
}

function formatCredits(value: number): string {
  return new Intl.NumberFormat('en-IN').format(Math.max(0, Math.round(value)));
}

export function InsufficientCreditsDialog({
  open,
  onClose,
  shortfall,
  actionDescription = 'send this invite',
  onAddCredits,
}: InsufficientCreditsDialogProps) {
  const router = useRouter();
  const { user } = useAuthSession();
  // Mirrors OpenFGA `can_manage_billing` (admin-only): only CLIENT_ADMIN can top
  // up credits. HR gets an "ask your admin" message instead of an Add-credits CTA
  // that would only land them on a Credits page OpenFGA blocks for them.
  const canAddCredits = user?.role === 'CLIENT_ADMIN';

  const handleAddCredits = () => {
    if (onAddCredits) {
      onAddCredits();
      return;
    }
    onClose();
    router.push(CREDITS_TOPUP_HREF);
  };

  return (
    <DialogBox
      open={open}
      onClose={onClose}
      placement="center"
      className="w-[460px] pt-2"
      footer={
        <ButtonContainer alignment="Center" configuration="Without Padding" className='pb-8 pt-4'>
          {canAddCredits ? (
            <>
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleAddCredits}>
                Add credits
              </Button>
            </>
          ) : (
            <Button variant="primary" onClick={onClose}>
              Got it
            </Button>
          )}
        </ButtonContainer>
      }
    >
      <div className="relative flex flex-col items-center px-6 pt-6 pb-2 text-center">
        <div className="w-full">
          <Image
            src="/assets/images/low-balance.jpg"
            alt=""
            width={273}
            height={167}
            className="mx-auto"
            priority={false}
          />
        </div>

        <h3 className="mt-5 text-body-lg font-semibold leading-body-l tracking-body-lg text-text-heading">
          Oops, not enough credits!
        </h3>
        <p className="mt-1 text-body-md font-normal leading-body-m tracking-body-md text-text-subheading">
          You&apos;re short of{' '}
          <span className="text-text-body">
            {formatCredits(shortfall)}
          </span>{' '}
          credits to {actionDescription}.{' '}
          {canAddCredits
            ? 'Add credits to continue.'
            : 'Ask your organization admin to add credits to continue.'}
        </p>
      </div>
    </DialogBox>
  );
}
