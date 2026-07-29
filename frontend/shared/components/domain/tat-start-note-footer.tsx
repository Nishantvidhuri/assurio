import { cn } from '@/shared/lib/utils';

// Green note rectangle that tucks UNDER the verification Timeline card and
// explains when the TAT clock starts. Shared by the admin and client
// case-detail views so the copy can't drift.
//
// Technique (mirrors the candidate dashboard hero footer): this is a SIBLING
// rendered right after the timeline card, pulled up with `-mt-2` so its top
// edge slides behind the card. The card must carry `relative z-10` so it
// paints on top and hides this rectangle's upper portion — leaving only a
// clean green strip with rounded bottom corners peeking out below. Because
// nothing is clipped by `overflow-hidden`, there are no corner gaps. The
// asymmetric padding (`pt-[14px] pb-1.5`) keeps the note text in the visible
// lower band after the overlap is subtracted.
export function TatStartNoteFooter({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'relative -mt-2 w-full rounded-b-md border border-border-default bg-surface-success px-5 pb-1.5 pt-[14px]',
        className,
      )}
    >
      <p className="text-body-sm text-text-body">
        <span className="font-bold">Note:</span> The TAT is started once the
        candidate successfully submits the form.
      </p>
    </div>
  );
}
