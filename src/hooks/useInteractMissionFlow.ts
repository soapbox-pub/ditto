import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useFollowList } from '@/hooks/useFollowActions';
import { useMissionCelebration } from '@/hooks/useMissionCelebration';
import { usePostOnboardingGuide } from '@/hooks/usePostOnboardingGuide';
import { missionDevForcesEmptyFeed } from '@/dev/missionHarness';
import { isMissionInteractState } from '@/lib/missionTasks';
import type { MissionInteraction } from '@/lib/postOnboardingGuide';

/**
 * View-side state for the guided `interact` ("Find something you like") task,
 * used by the feed to decide whether to show its guidance tip and what it
 * should say.
 *
 * **Presentational only** — it never completes anything. Completion is decided
 * by `useMissionEngine` from the shared post-interaction signal, so the user can
 * ignore this tip entirely, wander into a thread or a profile, and still finish
 * the task with the first thing they genuinely react to. That is the whole
 * point of the mission: the tip explains, it doesn't gate.
 *
 * The flow is *in progress* when the mission is active, the task isn't already
 * complete, and either the user arrived via the mission (route state set by
 * `useStartMissionTask`) or the mission still records `interact` as the task
 * they most recently launched — so navigating away and back doesn't lose the
 * guidance, and a reload doesn't either.
 */
export function useInteractMissionFlow(): {
  /** Whether the guidance tip belongs on this feed right now. */
  flowActive: boolean;
  /** Whether the task is complete and the tip should show its success state. */
  completed: boolean;
  /** What completed it, once it has. */
  interaction?: MissionInteraction;
  /**
   * Whether there is likely nothing of anyone else's to interact with — the
   * user follows nobody, so the default Following feed is empty.
   */
  emptyFeed: boolean;
} {
  const location = useLocation();
  const navigate = useNavigate();
  const { state, isActive, interaction } = usePostOnboardingGuide();
  const { celebrating, completedPath } = useMissionCelebration();
  const { data: followList } = useFollowList();

  // Latch whether this navigation started the flow. Route state is read once
  // and then cleared, so back/refresh doesn't re-flag it, while the latch keeps
  // the tip up for this mounted page.
  const [startedViaMission, setStartedViaMission] = useState(() =>
    isMissionInteractState(location.state),
  );

  useEffect(() => {
    if (!isMissionInteractState(location.state)) return;
    setStartedViaMission(true);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

  const pathCompleted = state?.paths.interact === 'completed';
  const inProgress =
    isActive && !pathCompleted && (startedViaMission || state?.activePath === 'interact');

  // Once it completes, the tip stays for the celebration window to deliver the
  // acknowledgement in the place the user is actually looking, then leaves.
  // Gated on `completedPath` so a *different* task finishing can never resurrect
  // it, and on `startedViaMission` so it only appears where it was already up.
  const justCompleted =
    celebrating && completedPath === 'interact' && (startedViaMission || pathCompleted);

  // Zero follows is the one reliably-knowable "your feed has nothing in it"
  // signal available without reaching into the feed's own query state. It is
  // also the only case with a genuinely useful next step to offer.
  const emptyFeed =
    missionDevForcesEmptyFeed() || (followList !== undefined && followList.pubkeys.length === 0);

  return {
    flowActive: !!inProgress || justCompleted,
    completed: justCompleted,
    interaction,
    emptyFeed,
  };
}
