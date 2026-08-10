import { useNavigate } from 'react-router-dom';
import { FormattedMessage } from 'react-intl';
import { Award, Check, ChevronRight, EyeOff, Sparkles } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DittoExplorerIntroduction } from '@/components/DittoExplorerIntroduction';
import { ExplorerJourneyMark } from '@/components/MissionArt';
import { ExplorerTransitionTarget } from '@/components/ExplorerTransitionTarget';
import { MissionProgressBar, MissionProgressCount } from '@/components/MissionProgress';
import { useAppContext } from '@/hooks/useAppContext';
import { useBoundedAttention } from '@/hooks/useBoundedAttention';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useMissionSurfaceState } from '@/hooks/useMissionSurfaceState';
import { useStartMissionTask } from '@/hooks/useStartMissionTask';
import { DITTO_EXPLORER_BADGE_NAME } from '@/lib/badgeClaim';
import { POST_ONBOARDING_PATHS } from '@/lib/postOnboardingGuide';
import { getStorageKey } from '@/lib/storageKey';
import { cn } from '@/lib/utils';

/**
 * The Ditto Explorer's primary desktop surface.
 *
 * It lives in the right sidebar on **every** page including Home, so the
 * mission belongs to the user's Ditto rather than to one route. The previous
 * design swapped between a large in-feed card on Home and this widget
 * elsewhere, which made the feature feel bolted onto a page.
 *
 * It shows a summary, never a full checklist — 300px is not the place for four
 * task rows. Title, progress, the one recommended next step, one primary
 * action, and a way to put it away. Everything deeper lives on `/missions`.
 *
 * Three presentations, one surface:
 *  - **introduction pending** → {@link DittoExplorerIntroduction}, so the
 *    introduction grows out of the slot that will go on to host the mission.
 *  - **active** → compact summary with the recommended step.
 *  - **reward unlocked** → a prompt pointing at `/missions`.
 *
 * Hidden missions render nothing here; `/missions` offers the resume.
 *
 * The reward prompt survives the claim. It used to disappear the instant the
 * claim was published, which was right while claiming was the end of the
 * journey — but the reveal is a separate fact now, and a user who claimed under
 * a build that had no reveal would otherwise have lost every route back to it.
 * It hides once the reward has actually been revealed. See `isCeremonyOwed`.
 *
 * ### It never claimed, and now it stops saying it does
 *
 * The reward action here has always been a **navigation**: it takes the user to
 * `/missions`, where the reward lives. It was labelled "Claim reward", so
 * pressing it looked like it should submit something and then visibly do
 * nothing but change page — the reported "no animation" defect. 300px is not
 * where an irreversible public publish should happen, and mounting a second
 * full-screen ceremony from the sidebar would give one act two owners, so the
 * fix is the label rather than the behaviour: it now says where it goes.
 */
export function MissionsWidget() {
  const navigate = useNavigate();
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const {
    state,
    isActive,
    completedCount,
    totalCount,
    introState,
    nextPath,
    dismissGuide,
    celebrating,
    ceremonyOwed,
    claimSubmitted,
    showProgress,
    interactionSuccess,
  } = useMissionSurfaceState();
  const startMissionTask = useStartMissionTask();

  const showIntro = introState === 'pending' && isActive;

  // A per-user budget, not a per-mount one: this widget remounts on every
  // navigation, so a mount-scoped cap would nudge on every page forever.
  const { ref: attentionRef, cueing, stop } = useBoundedAttention({
    enabled: isActive && !showIntro && completedCount === 0,
    budgetKey: user ? getStorageKey(config.appId, `mission-attention:${user.pubkey}`) : undefined,
  });

  if (!state || (!isActive && !ceremonyOwed)) return null;

  // Introduction, while pending. Wrapped as the arrival transition's target so
  // the travelling card knows exactly where to land — and so this stays laid
  // out (but unpainted) until it does, which is what keeps the handoff free of
  // any layout shift. Postponed introductions fall through to the summary.
  if (showIntro) {
    return (
      <ExplorerTransitionTarget className="mb-2 w-full shrink-0">
        <DittoExplorerIntroduction variant="sidebar" />
      </ExplorerTransitionTarget>
    );
  }

  const nextLabel = nextPath ? POST_ONBOARDING_PATHS[nextPath].label : undefined;

  return (
    <div ref={attentionRef} className="mb-2 w-full shrink-0" onPointerDown={stop}>
      <Card
        className={cn(
          'overflow-hidden border-primary/30 p-3',
          'bg-gradient-to-br from-primary/5 via-card to-card',
          cueing && 'mission-attention-glow',
          celebrating && 'mission-celebrate',
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
            <Sparkles className="size-3 shrink-0" aria-hidden />
            {ceremonyOwed && !celebrating ? (
              <FormattedMessage id="mission.widget.reward" defaultMessage="Reward unlocked" />
            ) : (
              <FormattedMessage id="mission.widget.eyebrow" defaultMessage="Mission" />
            )}
          </span>
          {showProgress && (
            <MissionProgressCount
              completedCount={completedCount}
              totalCount={totalCount}
              celebrating={celebrating}
              countClassName="block rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary"
              ariaLabel={`${completedCount} of ${totalCount} complete`}
            />
          )}
        </div>

        <button
          type="button"
          onClick={() => navigate('/missions')}
          className="mt-2 flex w-full items-center gap-2.5 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={
            ceremonyOwed
              ? claimSubmitted
                ? `${DITTO_EXPLORER_BADGE_NAME} — badge claim submitted`
                : `${DITTO_EXPLORER_BADGE_NAME} — open your reward`
              : `${DITTO_EXPLORER_BADGE_NAME}: ${completedCount} of ${totalCount} steps complete`
          }
        >
          <ExplorerJourneyMark className="size-10 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-snug text-foreground">
              {DITTO_EXPLORER_BADGE_NAME}
            </p>
            <p className="truncate text-[11px] leading-snug text-muted-foreground">
              {interactionSuccess ? (
                <span className="inline-flex items-center gap-1 font-medium text-primary">
                  <Check className="size-3 shrink-0" aria-hidden />
                  {interactionSuccess}
                </span>
              ) : ceremonyOwed ? (
                <span className="inline-flex items-center gap-1 text-primary">
                  <Award className="size-3 shrink-0" aria-hidden />
                  {/* Never "Claim your badge" once the claim has gone out —
                      the surface would be asking for something already done. */}
                  {claimSubmitted ? (
                    <FormattedMessage
                      id="mission.widget.claimSubmitted"
                      defaultMessage="Badge claim submitted"
                    />
                  ) : (
                    <FormattedMessage
                      id="mission.widget.claim"
                      defaultMessage="Your reward is ready"
                    />
                  )}
                </span>
              ) : nextLabel ? (
                <FormattedMessage
                  id="mission.widget.next"
                  defaultMessage="Next: {step}"
                  values={{ step: nextLabel }}
                />
              ) : (
                <FormattedMessage id="mission.widget.first" defaultMessage="First mission" />
              )}
            </p>
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>

        {showProgress && (
          <MissionProgressBar
            completedCount={completedCount}
            totalCount={totalCount}
            celebrating={celebrating}
            className="mt-2.5 h-1.5"
            aria-hidden
          />
        )}

        <div className="mt-2.5 flex items-center gap-1.5">
          {/* One primary action — continue the recommended step, or go claim. */}
          <Button
            type="button"
            size="sm"
            className="h-8 flex-1 rounded-full text-xs font-semibold"
            onClick={() => {
              stop();
              if (ceremonyOwed || !nextPath) navigate('/missions');
              else startMissionTask(nextPath);
            }}
          >
            {ceremonyOwed ? (
              claimSubmitted ? (
                <FormattedMessage
                  id="mission.widget.openJourney"
                  defaultMessage="View journey"
                />
              ) : (
                <FormattedMessage
                  id="mission.widget.openReward"
                  defaultMessage="Open reward"
                />
              )
            ) : (
              <FormattedMessage id="mission.widget.continue" defaultMessage="Continue" />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => void dismissGuide()}
            title="Hide this mission — you can resume it from Missions"
          >
            <EyeOff className="size-3.5" aria-hidden />
            <FormattedMessage id="mission.widget.hide" defaultMessage="Hide" />
          </Button>
        </div>
      </Card>
    </div>
  );
}
