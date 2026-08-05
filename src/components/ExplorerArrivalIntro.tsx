import { FormattedMessage } from 'react-intl';
import { Compass } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * The framing copy above the Explorer card during the arrival's presentation
 * act — what the user is being shown, and why.
 *
 * It has to do the whole job of explanation, because nothing else does. A user
 * who has just finished signup does not know what "Ditto Explorer" is, and the
 * card on its own showed a name and a locked reward without ever saying that
 * there are 4 short missions behind it, or what they involve. Now the heading
 * frames it as a journey and the line beneath names all four areas — people,
 * personalisation, posting, discovery — so nothing has to be inferred.
 *
 * The eyebrow repeats the product name that also appears inside the card, which
 * is a real risk of reading as duplication. It is kept deliberately tertiary —
 * 11px, letterspaced, muted, and paired with a small compass — so it reads as a
 * label for the section rather than as a second title competing with the card's
 * own. Confirmed against browser captures at every supported viewport.
 *
 * **It belongs to the central stage only.** It is a sibling of the card, never
 * a child, so it cannot be dragged into the sidebar or the mobile teaser by the
 * shared-element transition — only the card travels. It is gone before the card
 * begins transforming, and inert the moment it starts leaving.
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
        // A 500ms exit, matching the act the stage machine allots it.
        'transition-opacity duration-500 ease-out',
        visible ? 'opacity-100' : 'opacity-0',
        visible && !reducedMotion && 'arrival-intro-in',
        className,
      )}
    >
      <p className="flex items-center justify-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary/70">
        <Compass className="size-3 shrink-0" aria-hidden />
        <FormattedMessage id="arrival.intro.eyebrow" defaultMessage="Ditto Explorer" />
      </p>
      <h2 className="mt-1.5 text-xl font-bold leading-tight tracking-tight text-foreground sm:text-2xl [@media(max-height:720px)]:text-lg">
        <FormattedMessage
          id="arrival.intro.title"
          defaultMessage="Your first journey starts here"
        />
      </h2>
      <p className="mx-auto mt-2 max-w-[23rem] text-balance text-sm leading-relaxed text-muted-foreground [@media(max-height:720px)]:mt-1.5 [@media(max-height:720px)]:text-xs">
        <FormattedMessage
          id="arrival.intro.body"
          defaultMessage="Complete 4 simple missions to meet people, personalize Ditto, join the conversation, and explore the network."
        />
      </p>
    </div>
  );
}
