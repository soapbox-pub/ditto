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
  { simplified?: boolean; travelling?: boolean; ambient?: boolean; className?: string }
>(function ExplorerArrivalCard(
  { simplified = false, travelling = false, ambient = false, className },
  ref,
) {
  return (
    <div
      ref={ref}
      // Stable hook for tests and the development harness. Class names change
      // during the travel (the radius tightens), so they are not selectable.
      data-explorer-arrival-card=""
      aria-hidden={travelling || undefined}
      className={cn(
        'relative w-[min(22rem,calc(100vw-2.5rem))] overflow-hidden rounded-3xl p-6',
        '[@media(max-height:720px)]:rounded-2xl [@media(max-height:720px)]:p-4',
        // Deliberately richer than the compact widget it becomes: a deeper
        // shadow, a warmer gradient and a brighter edge, so it reads as a
        // presentation piece rather than a settings card dropped into a
        // cinematic. All three step down during the handoff, which is part of
        // how the transformation reads.
        'border border-primary/40 bg-gradient-to-br from-primary/[0.14] via-card to-card',
        'shadow-2xl shadow-primary/20 ring-1 ring-primary/10',
        // Transform origin is set imperatively by the FLIP runner; keeping the
        // card's own transitions off transform avoids fighting that animation.
        'transition-[box-shadow,border-radius,border-color] duration-500',
        simplified && 'border-primary/30 shadow-lg shadow-primary/10',
        travelling && 'rounded-xl shadow-md ring-primary/5',
        className,
      )}
    >
      {/* Ambient spotlight — a soft light behind the composition so the reading
          beat does not look frozen. Opacity only, two finite drifts, and it
          never moves or scales the card: the card must stay still enough to
          read. Gone the moment the handoff starts. */}
      {ambient && (
        <span
          aria-hidden
          className="arrival-card-spotlight pointer-events-none absolute inset-0 -z-10"
        />
      )}

      <div
        className={cn(
          'mb-3 flex justify-center transition-opacity duration-300',
          '[@media(max-height:720px)]:mb-2',
          simplified && 'opacity-0',
        )}
      >
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
          <Sparkles className="size-3 shrink-0" aria-hidden />
          <FormattedMessage id="explorer.intro.eyebrow" defaultMessage="New" />
        </span>
      </div>

      {/* No body copy here: the framing microcopy above the card already says
          "Find people, make Ditto yours, …", and the card's own line repeated
          almost the same words directly beneath it. One statement per idea.

          During handoff preparation this adopts the destination's own
          arrangement — small badge on the left, text beside it. Without that,
          the aligned crossfade showed two different compositions on top of each
          other: the badge in two places and the headline wrapping differently.
          Changing mode *before* the card moves is also what makes the travel
          read as one object relocating rather than two things swapping. */}
      {/* The reserved height is held through the mode change on purpose. The
          arrangement swaps while the card's box stays exactly where it is —
          otherwise the shorter content re-centres the whole composition and the
          card drifts ~75px downward while standing still, only to travel back
          up a moment later. All the shrinking belongs to the travel, where the
          FLIP drives it. */}
      <div
        className={cn(
          'flex w-full min-h-[9.5rem] justify-center',
          '[@media(max-height:720px)]:min-h-[7rem]',
          // Top-aligned once compacted, matching the destination's own
          // `items-start`; centred it sat ~40px lower and the crossfade showed
          // the badge and headline doubled at an offset.
          simplified ? 'items-start' : 'items-center',
        )}
      >
        <DittoExplorerVisual
          size={simplified ? 'sm' : 'lg'}
          layout={simplified ? 'row' : 'column'}
          showBody={false}
          className="w-full"
        />
      </div>

      {/* Locked reward preview — there is something to earn, and it is not
          shown yet. No astronaut, no badge art beyond the sealed frame. */}
      <div
        className={cn(
          'mt-4 flex items-center gap-2.5 rounded-xl border border-dashed border-primary/30 bg-primary/5 p-3',
          '[@media(max-height:720px)]:mt-3 [@media(max-height:720px)]:p-2.5',
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
