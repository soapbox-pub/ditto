import { useNavigate } from 'react-router-dom';
import { Award, ChevronRight, Sparkles } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { MissionCelebrationSparkle } from '@/components/MissionCelebrationSparkle';
import { Progress } from '@/components/ui/progress';
import { useMissionCelebration } from '@/hooks/useMissionCelebration';
import { usePostOnboardingGuide } from '@/hooks/usePostOnboardingGuide';
import {
  DITTO_EXPLORER_BADGE_IMAGE,
  DITTO_EXPLORER_BADGE_NAME,
} from '@/lib/badgeClaim';
import {
  POST_ONBOARDING_PATHS,
  POST_ONBOARDING_PATH_IDS,
} from '@/lib/postOnboardingGuide';
import { cn } from '@/lib/utils';

/**
 * Compact desktop mission teaser, pinned at the top of the widget sidebar.
 *
 * Deliberately *not* the full card: no task list, no claim button, no dismiss.
 * It shows the badge, a `2/4` progress readout, and what's up next, then links
 * to `/missions` — because the sidebar's job is to keep the mission in
 * peripheral vision across pages, not to compete with whatever the user came to
 * the page for.
 *
 * It is suppressed on the home feed (see `WidgetSidebar`), where the in-flow
 * card already shows, so the two never shout at once. Below `lg` the sidebar
 * isn't rendered at all and `MobileMissionTeaser` takes over.
 *
 * Visibility follows the shared mission state: shown while active, or completed
 * with the reward still unclaimed; hidden when dismissed, claimed, or
 * uninitialized.
 */
export function MissionsWidget() {
  const navigate = useNavigate();
  const { state, isActive, isCompleted, completedCount, totalCount, badgeClaim } =
    usePostOnboardingGuide();
  const { celebrating } = useMissionCelebration();

  const rewardUnlocked = isCompleted && badgeClaim?.status !== 'claimed';

  if (!state || (!isActive && !rewardUnlocked)) return null;

  const nextPathId = POST_ONBOARDING_PATH_IDS.find((id) => state.paths[id] !== 'completed');
  const nextLabel = nextPathId ? POST_ONBOARDING_PATHS[nextPathId].label : undefined;
  const progressValue = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <button
      type="button"
      onClick={() => navigate('/missions')}
      aria-label={
        rewardUnlocked
          ? `${DITTO_EXPLORER_BADGE_NAME} reward unlocked — claim your badge`
          : `${DITTO_EXPLORER_BADGE_NAME} mission: ${completedCount} of ${totalCount} steps complete`
      }
      className={cn(
        'mb-2 block w-full shrink-0 text-left',
        'rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      <Card
        className={cn(
          'overflow-hidden border-primary/30 p-3',
          'bg-gradient-to-br from-primary/5 via-card to-card',
          'transition-colors hover:border-primary/50 hover:bg-accent/40',
          celebrating && 'mission-celebrate',
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
            <Sparkles className="size-3 shrink-0" aria-hidden />
            {rewardUnlocked ? 'Reward unlocked' : 'Mission'}
          </span>
          {!rewardUnlocked && (
            <div className="relative shrink-0">
              <span
                className={cn(
                  'block rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary',
                  celebrating && 'mission-count-pop',
                )}
                aria-hidden
              >
                {completedCount}/{totalCount}
              </span>
              <MissionCelebrationSparkle active={celebrating} />
            </div>
          )}
        </div>

        <div className="mt-2 flex items-center gap-2.5">
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
                  Claim your badge
                </span>
              ) : nextLabel ? (
                <>Up next: {nextLabel}</>
              ) : (
                'First mission'
              )}
            </p>
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </div>

        {!rewardUnlocked && (
          <Progress
            value={progressValue}
            className={cn('mt-2.5 h-1.5', celebrating && 'mission-progress-glow')}
            aria-hidden
          />
        )}
      </Card>
    </button>
  );
}
