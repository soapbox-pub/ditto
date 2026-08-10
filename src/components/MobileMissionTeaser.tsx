import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FormattedMessage } from 'react-intl';
import { Award, Check, ChevronRight, Sparkles } from 'lucide-react';

import { ExplorerJourneyMark } from '@/components/MissionArt';
import { ExplorerTransitionTarget } from '@/components/ExplorerTransitionTarget';
import { MissionProgressCount } from '@/components/MissionProgress';
import { useAppContext } from '@/hooks/useAppContext';
import { useBoundedAttention } from '@/hooks/useBoundedAttention';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useMissionSurfaceState } from '@/hooks/useMissionSurfaceState';
import { DITTO_EXPLORER_BADGE_NAME } from '@/lib/badgeClaim';
import { missionProgressValue } from '@/lib/postOnboardingGuide';
import { getStorageKey } from '@/lib/storageKey';
import { cn } from '@/lib/utils';

/**
 * The mobile counterpart to the desktop `MissionsWidget`: a compact,
 * **in-flow** progress teaser that each page drops below its own header/tabs
 * and above its content.
 *
 * In-flow is the whole point. Earlier iterations tried a fixed strip under the
 * top bar and a floating pill; both read as chrome, needed height compensation,
 * and risked covering tabs or feed controls on small screens. As a normal
 * element it can't overlap navigation, can't cause content jump, and needs no
 * layout variables — so this is the only mobile mission surface that survived.
 *
 * It shows the badge, a thin progress bar with a `2/4` count, and a chevron;
 * tapping goes to `/missions`. Once complete it reframes as a reward prompt.
 * Hidden at `lg`+ where the sidebar widget takes over, and self-hiding when the
 * mission is dismissed, uninitialized, or the reward has been revealed.
 *
 * It deliberately outlives the claim. Hiding on `claimed` was right while
 * claiming ended the journey; the reveal is a separate fact now, so the prompt
 * stays (with truthful copy) until the reward has actually been revealed.
 *
 * Attention is one bounded glow (at most twice, never off-screen, never in a
 * hidden tab, never under `prefers-reduced-motion`). The predecessor also
 * animated a fake progress fill that pretended to advance and fall back — a
 * small lie about the user's own progress — which is intentionally gone.
 */
export function MobileMissionTeaser({ className }: { className?: string } = {}) {
  const navigate = useNavigate();
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const {
    state,
    isActive,
    completedCount,
    totalCount,
    introState,
    celebrating,
    ceremonyOwed,
    claimSubmitted,
    showProgress,
    interactionSuccess,
  } = useMissionSurfaceState();
  const [tapped, setTapped] = useState(false);

  const introPending = introState === 'pending' && isActive;
  const visible = !!state && (isActive || ceremonyOwed);

  // Per-user budget rather than per-mount: this teaser mounts on several pages,
  // so a mount-scoped cap would nudge again on each of them.
  const { ref: attentionRef, cueing, stop } = useBoundedAttention({
    enabled: visible && !ceremonyOwed && completedCount === 0 && !tapped,
    budgetKey: user ? getStorageKey(config.appId, `mission-attention:${user.pubkey}`) : undefined,
  });

  if (!visible) return null;

  return (
    <ExplorerTransitionTarget className={cn('lg:hidden mx-4 my-2', className)}>
      <div ref={attentionRef}>
      <button
        type="button"
        onClick={() => {
          setTapped(true);
          stop();
          navigate('/missions');
        }}
        aria-label={
          ceremonyOwed
            ? claimSubmitted
              ? `${DITTO_EXPLORER_BADGE_NAME} reward unlocked — badge claim submitted`
              : `${DITTO_EXPLORER_BADGE_NAME} reward unlocked — claim your badge`
            : `${DITTO_EXPLORER_BADGE_NAME} mission: ${completedCount} of ${totalCount} steps complete`
        }
        className={cn(
          'group flex w-full items-center gap-2.5 rounded-2xl px-3 py-2 text-left',
          'border border-border/60 bg-card/80 backdrop-blur-md',
          'shadow-sm ring-1 ring-primary/5',
          'transition-[transform,box-shadow] active:scale-[0.98]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          celebrating && 'mission-celebrate',
          // Never under the celebration: the reward's own attention cue must not
          // start on top of the completion moment that produced it.
          !celebrating && (ceremonyOwed ? 'mission-reward-glow' : cueing && 'mission-attention-glow'),
        )}
      >
        <ExplorerJourneyMark className="size-8 shrink-0" />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {ceremonyOwed ? (
              <Award className="size-3.5 shrink-0 text-primary" aria-hidden />
            ) : (
              <Sparkles className="size-3.5 shrink-0 text-primary" aria-hidden />
            )}
            <span className="truncate text-sm font-semibold text-foreground">
              {DITTO_EXPLORER_BADGE_NAME}
            </span>
            {showProgress && !introPending && (
              <MissionProgressCount
                completedCount={completedCount}
                totalCount={totalCount}
                celebrating={celebrating}
                className="ml-auto"
                countClassName="block text-[11px] font-medium tabular-nums text-muted-foreground"
                celebratingCountClassName="block text-[11px] font-medium tabular-nums rounded-full bg-primary/10 px-1.5 py-0.5 text-primary"
              />
            )}
          </div>

          {interactionSuccess ? (
            <p className="mt-0.5 flex items-center gap-1 truncate text-xs font-medium text-primary">
              <Check className="size-3 shrink-0" aria-hidden />
              {interactionSuccess}
            </p>
          ) : ceremonyOwed && !celebrating ? (
            <p className="mt-0.5 truncate text-xs font-medium text-primary">
              {/* Once the claim is in, asking for it again would be a lie. */}
              {claimSubmitted ? (
                <FormattedMessage
                  id="mission.teaser.rewardClaimed"
                  defaultMessage="Reward unlocked · Badge claim submitted"
                />
              ) : (
                <FormattedMessage
                  id="mission.teaser.reward"
                  defaultMessage="Reward unlocked · Open reward"
                />
              )}
            </p>
          ) : introPending ? (
            /* Before acknowledgement the teaser is an invitation, not a
               progress bar — a 0/4 meter is a poor first impression, and the
               introduction itself lives on /missions where there is room.
               Its own id rather than `explorer.intro.headline`: the same
               sentence, but without the full stop the panel's headline carries. */
            <p className="mt-0.5 truncate text-xs font-medium text-primary">
              <FormattedMessage
                id="mission.teaser.introPending"
                defaultMessage="Your first journey through Ditto is ready"
              />
            </p>
          ) : (
            <div
              className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-primary/10"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={totalCount}
              aria-valuenow={completedCount}
            >
              <div
                className={cn(
                  'h-full rounded-full bg-primary transition-[width] duration-500',
                  celebrating && 'mission-progress-glow',
                )}
                style={{ width: `${missionProgressValue(completedCount, totalCount)}%` }}
              />
            </div>
          )}
        </div>

        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground transition-transform group-active:translate-x-0.5"
          aria-hidden
        />
      </button>
      </div>
    </ExplorerTransitionTarget>
  );
}
