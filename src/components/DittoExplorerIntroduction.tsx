import { useEffect } from 'react';
import { FormattedMessage } from 'react-intl';
import { Compass, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { usePostOnboardingGuide } from '@/hooks/usePostOnboardingGuide';
import { DITTO_EXPLORER_BADGE_IMAGE, DITTO_EXPLORER_BADGE_NAME } from '@/lib/badgeClaim';
import { cn } from '@/lib/utils';

export type ExplorerIntroductionVariant = 'sidebar' | 'page';

/**
 * The Ditto Explorer introduction — what a user meets *before* the task list.
 *
 * The previous experience opened with four checklist rows and no explanation,
 * which reads as a chore assignment. This is the missing beat: what this is,
 * why it exists, and an explicit invitation to begin. Task rows stay hidden
 * until "Start exploring" is chosen (see `canShowMissionDetail`).
 *
 * Two variants share all copy and behaviour:
 *  - `sidebar` — anchored in the desktop widget slot, so the introduction grows
 *    out of the surface that will go on to host the mission rather than
 *    arriving as an unrelated interruption.
 *  - `page` — the `/missions` presentation, and the destination the mobile
 *    teaser opens. Mobile deliberately gets no modal: on a small screen a
 *    blocking dialog immediately after arrival is an ambush.
 *
 * "Maybe later" postpones **the introduction only** — the mission stays active
 * and keeps detecting progress, and `/missions` keeps offering this panel.
 */
export function DittoExplorerIntroduction({
  variant = 'page',
  className,
}: {
  variant?: ExplorerIntroductionVariant;
  className?: string;
}) {
  const { acknowledgeIntro, postponeIntro, markIntroPresented } = usePostOnboardingGuide();
  const compact = variant === 'sidebar';

  // Record that it was shown. Informational only — it never changes what the
  // user is offered, so a failed write cannot strand anyone.
  useEffect(() => {
    void markIntroPresented();
  }, [markIntroPresented]);

  return (
    <section
      aria-labelledby="explorer-intro-title"
      className={cn(
        'overflow-hidden rounded-xl border border-primary/30',
        'bg-gradient-to-br from-primary/10 via-card to-card',
        compact ? 'p-3' : 'p-5',
        className,
      )}
    >
      <div className={cn('flex items-center gap-2', compact ? 'mb-2' : 'mb-3')}>
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
          <Sparkles className="size-3 shrink-0" aria-hidden />
          <FormattedMessage id="explorer.intro.eyebrow" defaultMessage="New" />
        </span>
      </div>

      <div className={cn('flex gap-3', compact ? 'items-start' : 'items-center')}>
        <img
          src={DITTO_EXPLORER_BADGE_IMAGE}
          alt=""
          aria-hidden
          loading="lazy"
          className={cn(
            'shrink-0 rounded-xl object-cover ring-1 ring-primary/20',
            compact ? 'size-12' : 'size-16',
          )}
        />
        <div className="min-w-0 flex-1 space-y-1">
          {/* The sidebar has no other title, so it names the mission. The page
              already carries the mission name in its own header — repeating it
              here just reads as a stutter. */}
          {compact && (
            <p className="text-sm font-bold leading-tight text-foreground">
              {DITTO_EXPLORER_BADGE_NAME}
            </p>
          )}
          <h2
            id="explorer-intro-title"
            className={cn(
              'font-semibold leading-snug text-foreground',
              compact ? 'text-xs' : 'text-lg font-bold leading-tight',
            )}
          >
            <FormattedMessage
              id="explorer.intro.headline"
              defaultMessage="Your first journey through Ditto is ready."
            />
          </h2>
          {!compact && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              <FormattedMessage
                id="explorer.intro.body"
                defaultMessage="Discover people, make Ditto yours, and join the conversation."
              />
            </p>
          )}
        </div>
      </div>

      {compact && (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          <FormattedMessage
            id="explorer.intro.body"
            defaultMessage="Discover people, make Ditto yours, and join the conversation."
          />
        </p>
      )}

      <div className={cn('flex gap-2', compact ? 'mt-3 flex-col' : 'mt-4')}>
        <Button
          type="button"
          size="sm"
          className={cn('gap-1.5 rounded-full font-semibold', !compact && 'px-5')}
          onClick={() => void acknowledgeIntro()}
        >
          <Compass className="size-4" aria-hidden />
          <FormattedMessage id="explorer.intro.start" defaultMessage="Start exploring" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="rounded-full text-muted-foreground hover:text-foreground"
          onClick={() => void postponeIntro()}
        >
          <FormattedMessage id="explorer.intro.later" defaultMessage="Maybe later" />
        </Button>
      </div>
    </section>
  );
}
