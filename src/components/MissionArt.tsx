import { Lock, Sparkles } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Artwork for the mission surfaces, and the reason there are two kinds of it.
 *
 * The Ditto Explorer badge image (`DITTO_EXPLORER_BADGE_IMAGE`) **is the
 * reward**: a sticker showing exactly what the user gets for finishing the
 * journey. It was being used as the journey's identity as well, on every
 * surface, from the first second of the arrival onwards. Desaturating it did
 * not help, because the shape is the spoiler.
 *
 * So the two ideas are separated here:
 *
 *  - {@link ExplorerJourneyMark} — what the *journey* looks like. Abstract, and
 *    safe to show at 0/4.
 *  - {@link LockedRewardArt} — what the *unrevealed reward* looks like. A
 *    sealed token that deliberately resembles nothing in particular.
 *
 * Neither contains the reward's artwork or its silhouette. The real image is
 * rendered by `/badges` once the badge has actually been issued, which is the
 * one place it means what it shows.
 */

/**
 * The Ditto Explorer journey's own mark.
 *
 * An orbit and a small traveller: it echoes Ditto's ringed planet without
 * borrowing the app's logo, and says "a journey" rather than "a prize". Built
 * from an inline SVG so it inherits the theme's primary colour, costs no
 * network request, and cannot be confused with the badge.
 */
export function ExplorerJourneyMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      // Stable hook for tests and the development harness: the class list
      // carries per-surface sizing, so it is not selectable.
      data-explorer-journey-mark=""
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl',
        'bg-gradient-to-br from-primary/20 via-primary/10 to-transparent ring-1 ring-primary/20',
        className,
      )}
    >
      <svg viewBox="0 0 48 48" fill="none" className="size-[64%] text-primary">
        <ellipse
          cx="24"
          cy="24"
          rx="19"
          ry="8"
          stroke="currentColor"
          strokeOpacity="0.4"
          strokeWidth="2"
          transform="rotate(-24 24 24)"
        />
        <circle cx="24" cy="24" r="8.5" stroke="currentColor" strokeWidth="2.5" />
        <circle cx="24" cy="24" r="3" fill="currentColor" fillOpacity="0.5" />
        <circle cx="39.5" cy="15" r="2.75" fill="currentColor" />
      </svg>
    </span>
  );
}

/**
 * The reward, still sealed.
 *
 * A layered token with nothing recognisable inside it. The whole point is that
 * it tells the user something is waiting without telling them what, so it must
 * not acquire a silhouette, a colour scheme, or an outline borrowed from the
 * badge as the reveal work lands.
 *
 * `ready` is the 4/4-but-unclaimed state: the seal reads as openable rather
 * than locked, and the padlock becomes a spark. It is still not the reward.
 * Revealing what is inside belongs to the reveal experience, which does not
 * exist yet.
 *
 * The locked state never relies on colour alone: there is a padlock glyph here
 * and an explicit "Locked" label beside it in {@link MissionReward}.
 */
export function LockedRewardArt({
  ready = false,
  className,
}: {
  /** The journey is finished and the reward can be claimed. */
  ready?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      data-locked-reward-art=""
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-2xl',
        'ring-1',
        ready ? 'ring-primary/30' : 'ring-border',
        className,
      )}
    >
      {/* Depth, without a shape: a soft field behind a flat wash. */}
      <span
        className={cn(
          'absolute inset-0',
          ready
            ? 'bg-[radial-gradient(circle_at_50%_38%,hsl(var(--primary)/0.30),hsl(var(--primary)/0.10)_52%,transparent_76%)]'
            : 'bg-[radial-gradient(circle_at_50%_38%,hsl(var(--primary)/0.16),hsl(var(--primary)/0.05)_52%,transparent_76%)]',
        )}
      />
      <span className={cn('absolute inset-0', ready ? 'bg-primary/[0.04]' : 'bg-muted/40')} />

      {/* The seal. A hexagon is deliberately generic — it is a container, not a
          hint about its contents. */}
      <svg viewBox="0 0 64 64" fill="none" className="relative size-[62%]">
        <polygon
          points="32,7 54,19.5 54,44.5 32,57 10,44.5 10,19.5"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinejoin="round"
          className={ready ? 'text-primary/70' : 'text-muted-foreground/40'}
        />
        <polygon
          points="32,15 47,23.5 47,40.5 32,49 17,40.5 17,23.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="3 4"
          strokeLinejoin="round"
          className={ready ? 'text-primary/50' : 'text-muted-foreground/30'}
        />
      </svg>

      <span
        className={cn(
          'absolute flex items-center justify-center rounded-full',
          'size-[30%] min-h-6 min-w-6',
          ready ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground ring-1 ring-border',
        )}
      >
        {ready ? (
          <Sparkles className="size-[55%] min-h-3 min-w-3" aria-hidden />
        ) : (
          <Lock className="size-[55%] min-h-3 min-w-3" aria-hidden />
        )}
      </span>
    </span>
  );
}
