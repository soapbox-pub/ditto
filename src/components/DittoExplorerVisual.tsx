import { FormattedMessage } from 'react-intl';

import { ExplorerJourneyMark } from '@/components/MissionArt';
import { DITTO_EXPLORER_BADGE_NAME } from '@/lib/badgeClaim';
import { cn } from '@/lib/utils';

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
 * so they compose `ExplorerJourneyMark` directly rather than using this.
 *
 * The mark is the *journey's*, not the reward's. This used to render the badge
 * image, which is a picture of what the user has not earned yet.
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
      <ExplorerJourneyMark
        className={cn('shrink-0 transition-all duration-500', BADGE_SIZE[size])}
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
