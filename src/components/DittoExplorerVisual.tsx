import { FormattedMessage } from 'react-intl';

import { DITTO_EXPLORER_BADGE_IMAGE, DITTO_EXPLORER_BADGE_NAME } from '@/lib/badgeClaim';
import { cn } from '@/lib/utils';

export type ExplorerVisualSize = 'sm' | 'md' | 'lg';

const BADGE_SIZE: Record<ExplorerVisualSize, string> = {
  sm: 'size-12',
  md: 'size-16',
  lg: 'size-24',
};

const NAME_SIZE: Record<ExplorerVisualSize, string> = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-xl',
};

const HEADLINE_SIZE: Record<ExplorerVisualSize, string> = {
  sm: 'text-xs',
  md: 'text-lg',
  lg: 'text-2xl',
};

/**
 * The visual identity of Ditto Explorer — badge, name, headline, explanation —
 * shared by every surface that presents the mission.
 *
 * It exists so the big arrival card and the compact destination it becomes are
 * genuinely built from the same parts. The shared-element transition asks the
 * user to believe those two are one object; if each surface owned its own copy
 * of the markup they would drift, and the illusion would break the first time
 * someone edited one of them.
 *
 * Layout and interactivity stay with the callers — this owns only the identity.
 */
export function DittoExplorerVisual({
  size = 'md',
  layout = 'row',
  showBody = true,
  showName = true,
  /**
   * Fades the explanatory copy without unmounting it. Used while the arrival
   * card travels to its destination: the card visibly simplifies to what the
   * compact surface shows, and because nothing unmounts, the height change is
   * smooth rather than a jump.
   */
  detailsHidden = false,
  className,
}: {
  size?: ExplorerVisualSize;
  layout?: 'row' | 'column';
  showBody?: boolean;
  showName?: boolean;
  detailsHidden?: boolean;
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
      <img
        src={DITTO_EXPLORER_BADGE_IMAGE}
        alt=""
        aria-hidden
        loading="eager"
        className={cn(
          'shrink-0 rounded-xl object-cover ring-1 ring-primary/20 transition-all duration-500',
          BADGE_SIZE[size],
        )}
      />
      <div className={cn('min-w-0 space-y-1', !column && 'flex-1')}>
        {showName && (
          <p className={cn('font-bold leading-tight text-foreground', NAME_SIZE[size])}>
            {DITTO_EXPLORER_BADGE_NAME}
          </p>
        )}
        <p
          className={cn(
            'font-semibold leading-snug text-foreground',
            HEADLINE_SIZE[size],
          )}
        >
          <FormattedMessage
            id="explorer.intro.headline"
            defaultMessage="Your first journey through Ditto is ready."
          />
        </p>
        {showBody && (
          <p
            className={cn(
              'text-sm leading-relaxed text-muted-foreground transition-opacity duration-300',
              detailsHidden && 'opacity-0',
            )}
          >
            <FormattedMessage
              id="explorer.intro.body"
              defaultMessage="Discover people, make Ditto yours, and join the conversation."
            />
          </p>
        )}
      </div>
    </div>
  );
}
