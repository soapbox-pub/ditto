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
 * It carries no actions. The user chooses "Start exploring" or "Maybe later" on
 * the destination once the transition lands, so the arrival never becomes a
 * blocking wizard waiting on a click.
 *
 * ### The content transformation
 *
 * Before the card moves, its contents change mode: the full presentation
 * content leaves and the compact, destination-shaped content takes its place.
 * Both groups are stacked in one grid cell, so neither displaces the other and
 * the outer shell never changes size while its contents are swapping — the
 * shell's own collapse belongs to the travel.
 *
 * The full content leaves **bottom to top**, as a staggered group exit: the
 * locked-reward row first, then the badge/name block, then the eyebrow. Each
 * block moves and fades as a whole unit, which is what keeps this from reading
 * as a responsive container crushing its children. A `clip-path` closes from
 * the bottom in step with the stagger, so the erasure looks authored — and
 * because every block is already faded by the time the mask edge reaches it, no
 * glyph is ever cut in half.
 *
 * The compact content then rises in from just below, revealed top-down by its
 * own `clip-path`. Between the two there is a brief window where only the card
 * shell remains, which makes the change of mode legible rather than mushy.
 */
export const ExplorerArrivalCard = forwardRef<
  HTMLDivElement,
  {
    /** The full presentation content is shown and unchanged. */
    showFullContent?: boolean;
    /** The compact, destination-shaped content is shown. */
    showCompactContent?: boolean;
    /** The card is flying to its destination. */
    travelling?: boolean;
    /** Run the ambient spotlight (reading beat only). */
    ambient?: boolean;
    /** Crossfade instead of wiping — reduced motion. */
    reducedMotion?: boolean;
    className?: string;
  }
>(function ExplorerArrivalCard(
  {
    showFullContent = true,
    showCompactContent = false,
    travelling = false,
    ambient = false,
    reducedMotion = false,
    className,
  },
  ref,
) {
  const compacted = showCompactContent || travelling;

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
        compacted && 'border-primary/30 shadow-lg shadow-primary/10',
        travelling && 'rounded-xl shadow-md ring-primary/5',
        className,
      )}
    >
      {/* Ambient spotlight — a soft light behind the composition so the reading
          beat does not look frozen. Opacity only, finite, and it never moves or
          scales the card: the card must stay still enough to read. */}
      {ambient && (
        <span
          aria-hidden
          className="arrival-card-spotlight pointer-events-none absolute inset-0 -z-10"
        />
      )}

      {/* Both content groups share one grid cell. The cell is as tall as the
          full content, so swapping them never resizes the shell — and the
          compact group sits top-aligned, exactly where the destination's own
          content sits. */}
      <div className="grid">
        <div
          data-arrival-card-full=""
          aria-hidden={!showFullContent || undefined}
          className={cn(
            'col-start-1 row-start-1',
            !showFullContent && 'pointer-events-none',
            !showFullContent &&
              (reducedMotion ? 'opacity-0 transition-opacity duration-200' : 'arrival-content-out'),
          )}
        >
          {/* Bottom-to-top exit: the eyebrow is the last to go, so the stagger
              runs upward, against the reading order. */}
          <div
            className={cn(
              'arrival-block mb-3 flex justify-center',
              '[@media(max-height:720px)]:mb-2',
            )}
            style={{ '--block-delay': '150ms' } as React.CSSProperties}
          >
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
              <Sparkles className="size-3 shrink-0" aria-hidden />
              <FormattedMessage id="explorer.intro.eyebrow" defaultMessage="New" />
            </span>
          </div>

          {/* No body copy here: the framing microcopy above the card already
              says "Find people, make Ditto yours, …", and the card's own line
              repeated almost the same words directly beneath it. */}
          <div
            className="arrival-block flex justify-center"
            style={{ '--block-delay': '75ms' } as React.CSSProperties}
          >
            <DittoExplorerVisual size="lg" layout="column" showBody={false} />
          </div>

          <div
            className={cn(
              'arrival-block mt-4 flex items-center gap-2.5 rounded-xl border border-dashed border-primary/30 bg-primary/5 p-3',
              '[@media(max-height:720px)]:mt-3 [@media(max-height:720px)]:p-2.5',
            )}
            style={{ '--block-delay': '0ms' } as React.CSSProperties}
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

        {/* The compact group — the destination's own arrangement, in the
            destination's own measurements, so the card arrives already looking
            like the surface it becomes. */}
        <div
          data-arrival-card-compact=""
          aria-hidden={compacted ? undefined : true}
          className={cn(
            'col-start-1 row-start-1 self-start',
            !compacted && 'pointer-events-none opacity-0',
            compacted &&
              (reducedMotion
                ? 'opacity-100 transition-opacity duration-200'
                : 'arrival-content-in'),
          )}
        >
          <DittoExplorerVisual size="sm" layout="row" showBody={false} className="w-full" />
        </div>
      </div>
    </div>
  );
});
