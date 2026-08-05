import { FormattedMessage } from 'react-intl';
import { Lock } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * The quiet line beneath the Explorer card: permission to take your time, and a
 * reminder that finishing leads somewhere.
 *
 * It sits *below* the card on purpose. Above, it would have competed with the
 * heading and pushed the card down the composition; below, it reads as a
 * footnote to the thing it is talking about, and it is the last element to
 * arrive so the composition assembles top-down.
 *
 * It echoes the locked-reward row inside the card — same `Lock`, same muted
 * treatment — so the two read as connected, while staying strictly outside the
 * card's DOM. That boundary is load-bearing: the card is the travelling
 * element, and its measured geometry decides where the FLIP transition lands.
 * Anything inside it would be dragged into the sidebar widget and the mobile
 * teaser, and would change the rect the transition measures. This is a sibling,
 * so it can do neither.
 *
 * Deliberately vague about the reward. Naming it here would spend the reveal
 * before the user has done anything, and the card's own row already says a
 * reward exists without saying what it is.
 */
export function ExplorerArrivalReassurance({
  visible,
  reducedMotion,
  className,
}: {
  visible: boolean;
  reducedMotion: boolean;
  className?: string;
}) {
  return (
    <div
      data-arrival-reassurance=""
      aria-hidden={!visible || undefined}
      {...({ inert: visible ? undefined : true } as { inert?: boolean })}
      className={cn(
        // Quieter than the explanatory copy above the card: smaller, muted, and
        // with no background of its own, so it cannot read as an advertisement.
        //
        // A centred *block*, not a flex row. As a flex row the icon was a
        // sibling of the text, so at 360px the sentence wrapped to two lines and
        // the lock was pushed out to the left edge, detached from the words it
        // belongs to. Inline keeps it attached to the first word at every width.
        'mx-auto max-w-[22rem] px-2 text-center text-balance',
        'text-xs leading-relaxed text-muted-foreground/90',
        // A 500ms exit, matching the act the stage machine allots it.
        'transition-opacity duration-500 ease-out',
        visible ? 'opacity-100' : 'opacity-0',
        // Enters last, after the card it refers to has settled.
        visible && !reducedMotion && 'arrival-reassurance-in',
        className,
      )}
    >
      <Lock className="mr-1.5 inline size-3 shrink-0 align-[-1px] text-primary/60" aria-hidden />
      <FormattedMessage
        id="arrival.reassurance"
        defaultMessage="Take your time. A special reward is waiting at the end."
      />
    </div>
  );
}
