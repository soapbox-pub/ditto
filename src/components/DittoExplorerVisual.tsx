import { FormattedMessage } from 'react-intl';
import { Lock } from 'lucide-react';

import { DITTO_EXPLORER_BADGE_IMAGE, DITTO_EXPLORER_BADGE_NAME } from '@/lib/badgeClaim';
import { cn } from '@/lib/utils';

/**
 * The Ditto Explorer badge artwork, and the one place that knows how it is
 * drawn.
 *
 * Every mission surface shows this image — the arrival card, the introduction,
 * the sidebar widget, the mobile teaser, and both states of the reward panel —
 * and each of them used to re-specify the source, the object fit, the ring and
 * the locked treatment itself. That is the drift the shared-element transition
 * cannot survive: the card that flies out of the arrival is supposed to *be*
 * the widget it lands in.
 *
 * Placement stays with the caller. Size and radius arrive through `className`
 * because they are genuinely per-surface (a 32px strip on mobile, an 80px hero
 * in the reward panel); what is shared is everything else.
 */
export function ExplorerBadgeArt({
  className,
  alt = '',
  locked = false,
  eager = false,
  lock,
}: {
  /**
   * Size, radius and flex behaviour for this surface. Deliberately not baked
   * in: the compact surfaces need `shrink-0` inside their flex rows, and the
   * reward panel's centred badge does not.
   */
  className?: string;
  /** Non-empty makes it a meaningful image; empty leaves it decorative. */
  alt?: string;
  /** Not earned yet: the shared dim-and-desaturate treatment. */
  locked?: boolean;
  /**
   * Load immediately rather than lazily. The arrival composition is a timed
   * sequence — the badge cannot pop in halfway through the reading hold.
   */
  eager?: boolean;
  /**
   * Padlock overlay, for the one surface that states the lock explicitly
   * rather than implying it with the dimmed treatment.
   */
  lock?: { badgeClassName: string; iconClassName: string };
}) {
  const image = (
    <img
      src={DITTO_EXPLORER_BADGE_IMAGE}
      alt={alt}
      aria-hidden={alt ? undefined : true}
      loading={eager ? 'eager' : 'lazy'}
      className={cn(
        'object-cover ring-1 ring-primary/20',
        locked && 'opacity-70 grayscale',
        className,
      )}
    />
  );

  if (!lock) return image;

  return (
    <div className="relative shrink-0">
      {image}
      <span
        className={cn(
          'absolute -bottom-1 -right-1 flex items-center justify-center rounded-full bg-background text-muted-foreground shadow-sm ring-1 ring-border',
          lock.badgeClassName,
        )}
      >
        <Lock className={lock.iconClassName} aria-hidden />
      </span>
    </div>
  );
}

export type ExplorerVisualSize = 'sm' | 'lg';

/**
 * `lg` shrinks on short viewports. The arrival presentation stacks a heading,
 * microcopy and this card in one centred column; at 390x560 the full-size
 * version clipped off the bottom of the screen.
 */
const BADGE_SIZE: Record<ExplorerVisualSize, string> = {
  sm: 'size-12',
  lg: 'size-24 [@media(max-height:720px)]:size-16',
};

const NAME_SIZE: Record<ExplorerVisualSize, string> = {
  sm: 'text-sm',
  lg: 'text-base',
};

/**
 * The `lg` headline is deliberately smaller than the presentation title above
 * it. At `text-2xl` the two were the same weight and size, so the card competed
 * with the heading that was supposed to be introducing it.
 */
const HEADLINE_SIZE: Record<ExplorerVisualSize, string> = {
  sm: 'text-xs',
  lg: 'text-lg [@media(max-height:720px)]:text-base',
};

/**
 * The Ditto Explorer identity block — badge, name, headline — as the arrival
 * presents it.
 *
 * It exists so the big arrival card and the compact form it becomes are
 * genuinely built from the same parts. The shared-element transition asks the
 * user to believe those two are one object; if each owned its own copy of the
 * markup they would drift, and the illusion would break the first time someone
 * edited one of them.
 *
 * The destination surfaces arrange the identity differently (the widget stacks
 * a name over a next-step line; the teaser runs it inline with a progress bar),
 * so they compose {@link ExplorerBadgeArt} directly rather than using this.
 *
 * Layout and interactivity stay with the callers — this owns only the identity.
 */
export function DittoExplorerVisual({
  size = 'sm',
  layout = 'row',
  className,
}: {
  size?: ExplorerVisualSize;
  layout?: 'row' | 'column';
  className?: string;
}) {
  const column = layout === 'column';

  return (
    <div
      className={cn(
        'flex gap-3',
        column ? 'flex-col items-center text-center' : 'items-center',
        className,
      )}
    >
      <ExplorerBadgeArt
        eager
        className={cn('shrink-0 rounded-xl transition-all duration-500', BADGE_SIZE[size])}
      />
      <div className={cn('min-w-0 space-y-1', !column && 'flex-1')}>
        <p className={cn('font-bold leading-tight text-foreground', NAME_SIZE[size])}>
          {DITTO_EXPLORER_BADGE_NAME}
        </p>
        <p
          className={cn(
            'text-balance font-semibold leading-snug text-foreground',
            HEADLINE_SIZE[size],
          )}
        >
          <FormattedMessage
            id="explorer.intro.headline"
            defaultMessage="Your first journey through Ditto is ready."
          />
        </p>
      </div>
    </div>
  );
}
