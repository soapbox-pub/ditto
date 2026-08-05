import { forwardRef } from 'react';
import { FormattedMessage } from 'react-intl';
import { Lock, Sparkles } from 'lucide-react';

import { DittoExplorerVisual } from '@/components/DittoExplorerVisual';
import { cn } from '@/lib/utils';

/**
 * The large Ditto Explorer presentation shown in the centre of the arrival
 * experience, and the object that then travels to become the persistent
 * Explorer surface.
 *
 * It is an **introduction, not the checklist** — the four tasks are deliberately
 * absent. It shows what Ditto Explorer is, that a reward is waiting, and that
 * the reward is still locked. The reward silhouette is abstract on purpose:
 * what is behind the lock stays unrevealed for now.
 *
 * It carries no actions. The user chooses "Start exploring" or "Maybe later"
 * on the destination once the transition lands, so the arrival never becomes a
 * blocking wizard waiting on a click. It is `aria-hidden` while travelling
 * because by then the real, interactive surface is underneath it.
 */
export const ExplorerArrivalCard = forwardRef<
  HTMLDivElement,
  { simplified?: boolean; travelling?: boolean; className?: string }
>(function ExplorerArrivalCard({ simplified = false, travelling = false, className }, ref) {
  return (
    <div
      ref={ref}
      // Stable hook for tests and the development harness. Class names change
      // during the travel (the radius tightens), so they are not selectable.
      data-explorer-arrival-card=""
      aria-hidden={travelling || undefined}
      className={cn(
        'w-[min(22rem,calc(100vw-2.5rem))] overflow-hidden rounded-2xl p-5',
        'border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card',
        'shadow-xl shadow-primary/10 ring-1 ring-primary/5',
        // Transform origin is set imperatively by the FLIP runner; keeping the
        // card's own transitions off transform avoids fighting that animation.
        'transition-[box-shadow,border-radius] duration-500',
        travelling && 'rounded-xl shadow-md',
        className,
      )}
    >
      <div
        className={cn(
          'mb-3 flex justify-center transition-opacity duration-300',
          simplified && 'opacity-0',
        )}
      >
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
          <Sparkles className="size-3 shrink-0" aria-hidden />
          <FormattedMessage id="explorer.intro.eyebrow" defaultMessage="New" />
        </span>
      </div>

      <DittoExplorerVisual size="lg" layout="column" detailsHidden={simplified} />

      {/* Locked reward preview — there is something to earn, and it is not
          shown yet. No astronaut, no badge art beyond the sealed frame. */}
      <div
        className={cn(
          'mt-4 flex items-center gap-2.5 rounded-xl border border-dashed border-primary/30 bg-primary/5 p-3',
          'transition-opacity duration-300',
          simplified && 'opacity-0',
        )}
      >
        <span className="relative flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Lock className="size-4 text-primary/70" aria-hidden />
        </span>
        <p className="min-w-0 flex-1 text-left text-xs leading-snug text-muted-foreground">
          <FormattedMessage
            id="explorer.arrival.reward"
            defaultMessage="A reward is waiting at the end of your journey."
          />
        </p>
      </div>
    </div>
  );
});
