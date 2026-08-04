import { useState } from 'react';
import { Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { MissionCelebrationSparkle } from '@/components/MissionCelebrationSparkle';
import { MissionReward } from '@/components/MissionReward';
import { MissionTaskList } from '@/components/MissionTaskList';
import { useBoundedAttention } from '@/hooks/useBoundedAttention';
import { useMissionCelebration } from '@/hooks/useMissionCelebration';
import { usePostOnboardingGuide } from '@/hooks/usePostOnboardingGuide';
import { DITTO_EXPLORER_BADGE_NAME } from '@/lib/badgeClaim';
import { cn } from '@/lib/utils';

const INTRO_COPY = {
  title: 'Find your way around Ditto',
  subtitle: 'Pick something to try. You can complete these in any order.',
};

/**
 * Header copy once every task is complete — reframes the card from "do these
 * steps" to "claim your reward".
 */
const COMPLETED_COPY = {
  title: `You unlocked the ${DITTO_EXPLORER_BADGE_NAME} badge`,
  subtitle: 'Claim it to mark your first journey through Ditto.',
};

/**
 * Inline (never modal) dismiss confirmation rendered in place of the card body.
 * Finishing the mission unlocks a badge, so dismissing shouldn't happen on a
 * single casual tap.
 */
function DismissConfirm({
  onKeepGoing,
  onConfirm,
}: {
  onKeepGoing: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <div className="space-y-1">
        <p className="text-base font-semibold text-foreground">Hide this mission?</p>
        <p className="text-sm text-muted-foreground">
          Completing it unlocks the {DITTO_EXPLORER_BADGE_NAME} badge. You can always pick it
          back up from Missions — your progress is kept.
        </p>
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" className="flex-1" onClick={onKeepGoing}>
          Keep going
        </Button>
        <Button type="button" variant="outline" size="sm" className="flex-1" onClick={onConfirm}>
          Hide it
        </Button>
      </div>
    </div>
  );
}

/**
 * The post-onboarding mission card, pinned as the first item of the home feed.
 *
 * This is the mission's *in-flow* surface: it scrolls with the timeline, never
 * floats over navigation or feed controls, and disappears the moment the user
 * hides it. The durable, always-reachable version of the same mission lives at
 * `/missions`, which is why hiding this card is framed as "hide" rather than
 * "give up" — dismissal and completion are different things and the copy says
 * so.
 *
 * It renders while the mission is active, and once complete stays until the
 * reward is claimed or dismissed. It initializes nothing and completes nothing;
 * `MissionEngine` owns both.
 *
 * Attention is deliberately meagre: at most two bounded cues from
 * `useBoundedAttention`, none of them off-screen, in a hidden tab, under
 * `prefers-reduced-motion`, or after the user touches the card. Its predecessor
 * ran an infinite glow plus a 2-second inactivity poll for the life of the
 * page; that read as nagging and is gone.
 */
export function FirstSessionGuide() {
  const {
    state,
    isActive,
    isCompleted,
    completedCount,
    totalCount,
    allCompleted,
    dismissGuide,
  } = usePostOnboardingGuide();
  const { celebrating } = useMissionCelebration();

  const [confirmingDismiss, setConfirmingDismiss] = useState(false);
  const [engaged, setEngaged] = useState(false);

  // One bounded cue set, silenced by any interaction with the card or by any
  // progress at all.
  const { ref: attentionRef, cueing, stop: stopAttention } = useBoundedAttention({
    enabled: isActive && completedCount === 0 && !engaged,
  });

  // Render while active, or completed-but-not-yet-dismissed. A hidden mission
  // never renders here (it stays available on /missions).
  if ((!isActive && !isCompleted) || !state) return null;

  const engage = () => {
    setEngaged(true);
    stopAttention();
  };

  const handleDismiss = () => {
    engage();
    // After completion the footer reads "Dismiss" — hiding the claimed/
    // celebratory card is harmless (progress and any claim are preserved), so
    // it goes straight through. Before completion, confirm first.
    if (allCompleted) {
      void dismissGuide();
      return;
    }
    setConfirmingDismiss(true);
  };

  const headerCopy = allCompleted ? COMPLETED_COPY : INTRO_COPY;

  return (
    <div
      ref={attentionRef}
      onMouseEnter={engage}
      onFocusCapture={engage}
      onPointerDown={engage}
      className={cn('mx-2 mb-3 mt-2', cueing && 'mission-attention-nudge')}
    >
      <Card
        className={cn(
          'overflow-hidden border-primary/30',
          'bg-gradient-to-br from-primary/5 via-card to-card',
          cueing && 'mission-attention-glow',
          celebrating && 'mission-celebrate',
        )}
      >
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 p-4 pb-3">
          <div className="min-w-0 space-y-1">
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
              <Sparkles className="size-3 shrink-0" aria-hidden />
              First steps
            </span>
            <h3 className="text-base font-semibold leading-tight text-foreground">
              {headerCopy.title}
            </h3>
            <p className="text-sm text-muted-foreground">{headerCopy.subtitle}</p>
          </div>
          {!allCompleted && (
            <span className="relative shrink-0">
              <span
                className={cn(
                  'block rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary',
                  celebrating && 'mission-count-pop',
                )}
                aria-label={`${completedCount} of ${totalCount} complete`}
              >
                {completedCount}/{totalCount} complete
              </span>
              <MissionCelebrationSparkle active={celebrating} />
            </span>
          )}
        </CardHeader>

        <CardContent className="p-4 pt-0">
          {confirmingDismiss ? (
            <DismissConfirm
              onKeepGoing={() => setConfirmingDismiss(false)}
              onConfirm={() => {
                setConfirmingDismiss(false);
                void dismissGuide();
              }}
            />
          ) : (
            <div className="space-y-3">
              <MissionReward />
              {!allCompleted && (
                <MissionTaskList
                  state={state}
                  interactive={isActive}
                  columns={2}
                  onStart={engage}
                />
              )}
            </div>
          )}

          {!confirmingDismiss && (
            <div className="mt-3 flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={handleDismiss}
              >
                {allCompleted ? 'Dismiss' : 'I’ll explore on my own'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
