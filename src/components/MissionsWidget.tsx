import { useNavigate } from 'react-router-dom';
import { FormattedMessage } from 'react-intl';
import { Award, ChevronRight, EyeOff, Sparkles } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DittoExplorerIntroduction } from '@/components/DittoExplorerIntroduction';
import { ExplorerTransitionTarget } from '@/components/ExplorerTransitionTarget';
import { MissionCelebrationSparkle } from '@/components/MissionCelebrationSparkle';
import { Progress } from '@/components/ui/progress';
import { useAppContext } from '@/hooks/useAppContext';
import { useBoundedAttention } from '@/hooks/useBoundedAttention';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useMissionCelebration } from '@/hooks/useMissionCelebration';
import { usePostOnboardingGuide } from '@/hooks/usePostOnboardingGuide';
import { useStartMissionTask } from '@/hooks/useStartMissionTask';
import {
  DITTO_EXPLORER_BADGE_IMAGE,
  DITTO_EXPLORER_BADGE_NAME,
} from '@/lib/badgeClaim';
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
 *  - **reward unlocked** → claim prompt pointing at `/missions`.
 *
 * Hidden missions render nothing here; `/missions` offers the resume.
 */
export function MissionsWidget() {
  const navigate = useNavigate();
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const {
    state,
    isActive,
    isCompleted,
    completedCount,
    totalCount,
    badgeClaim,
    introState,
    nextPath,
    dismissGuide,
  } = usePostOnboardingGuide();
  const { celebrating } = useMissionCelebration();
  const startMissionTask = useStartMissionTask();

  const rewardUnlocked = isCompleted && badgeClaim?.status !== 'claimed';
  const showIntro = introState === 'pending' && isActive;

  // A per-user budget, not a per-mount one: this widget remounts on every
  // navigation, so a mount-scoped cap would nudge on every page forever.
  const { ref: attentionRef, cueing, stop } = useBoundedAttention({
    enabled: isActive && !showIntro && completedCount === 0,
    budgetKey: user ? getStorageKey(config.appId, `mission-attention:${user.pubkey}`) : undefined,
  });

  if (!state || (!isActive && !rewardUnlocked)) return null;

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

  const progressValue = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
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
            {rewardUnlocked ? (
              <FormattedMessage id="mission.widget.reward" defaultMessage="Reward unlocked" />
            ) : (
              <FormattedMessage id="mission.widget.eyebrow" defaultMessage="Mission" />
            )}
          </span>
          {!rewardUnlocked && (
            <div className="relative shrink-0">
              <span
                className={cn(
                  'block rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary',
                  celebrating && 'mission-count-pop',
                )}
                aria-label={`${completedCount} of ${totalCount} complete`}
              >
                {completedCount}/{totalCount}
              </span>
              <MissionCelebrationSparkle active={celebrating} />
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => navigate('/missions')}
          className="mt-2 flex w-full items-center gap-2.5 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={
            rewardUnlocked
              ? `${DITTO_EXPLORER_BADGE_NAME} — claim your badge`
              : `${DITTO_EXPLORER_BADGE_NAME}: ${completedCount} of ${totalCount} steps complete`
          }
        >
          <img
            src={DITTO_EXPLORER_BADGE_IMAGE}
            alt=""
            aria-hidden
            loading="lazy"
            className={cn(
              'size-10 shrink-0 rounded-lg object-cover ring-1 ring-primary/20',
              !rewardUnlocked && 'opacity-70 grayscale',
            )}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-snug text-foreground">
              {DITTO_EXPLORER_BADGE_NAME}
            </p>
            <p className="truncate text-[11px] leading-snug text-muted-foreground">
              {rewardUnlocked ? (
                <span className="inline-flex items-center gap-1 text-primary">
                  <Award className="size-3 shrink-0" aria-hidden />
                  <FormattedMessage id="mission.widget.claim" defaultMessage="Claim your badge" />
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

        {!rewardUnlocked && (
          <Progress
            value={progressValue}
            className={cn('mt-2.5 h-1.5', celebrating && 'mission-progress-glow')}
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
              if (rewardUnlocked || !nextPath) navigate('/missions');
              else startMissionTask(nextPath);
            }}
          >
            {rewardUnlocked ? (
              <FormattedMessage id="mission.widget.openReward" defaultMessage="Claim reward" />
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
