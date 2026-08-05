import { FormattedMessage } from 'react-intl';

import { cn } from '@/lib/utils';

/**
 * The framing copy above the Explorer card during the arrival's presentation
 * act — what the user is being shown, and why.
 *
 * The card alone was not enough context: it appeared with no explanation of
 * what it was or why it had turned up. This says it in one line.
 *
 * **It belongs to the central stage only.** It is a sibling of the card, never
 * a child, so it cannot be dragged into the sidebar or the mobile teaser by the
 * shared-element transition — only the card travels. It fades before the travel
 * begins and is inert the moment it does.
 *
 * It deliberately does not name Ditto Explorer or repeat "your first journey":
 * the card directly below already carries both, and two stacked copies of the
 * same phrase is exactly the layering problem this pass exists to remove.
 *
 * It stays in flow while faded rather than unmounting, so the card beneath it
 * never shifts — a card that jumped a few pixels just before travelling would
 * undo the illusion that it is one continuous object.
 */
export function ExplorerArrivalIntro({
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
      data-arrival-intro=""
      aria-hidden={!visible || undefined}
      {...({ inert: visible ? undefined : true } as { inert?: boolean })}
      className={cn(
        'w-[min(26rem,calc(100vw-2.5rem))] text-center',
        'transition-opacity duration-300 ease-out',
        visible ? 'opacity-100' : 'opacity-0',
        visible && !reducedMotion && 'arrival-intro-in',
        className,
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
        <FormattedMessage id="arrival.intro.eyebrow" defaultMessage="Your first mission" />
      </p>
      <h2 className="mt-1.5 text-xl font-bold leading-tight tracking-tight text-foreground sm:text-2xl [@media(max-height:720px)]:text-lg">
        <FormattedMessage id="arrival.intro.title" defaultMessage="Let’s get you started" />
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-balance text-sm leading-relaxed text-muted-foreground [@media(max-height:720px)]:mt-1.5 [@media(max-height:720px)]:text-xs">
        <FormattedMessage
          id="arrival.intro.body"
          defaultMessage="Find people, make Ditto yours, and take your first steps through the network."
        />
      </p>
    </div>
  );
}
