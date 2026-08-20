import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { usePostOnboardingGuide } from '@/hooks/usePostOnboardingGuide';
import { isMissionTaskState } from '@/lib/missionTasks';
import type { PostOnboardingPathId } from '@/lib/postOnboardingGuide';

/**
 * The part every guided task's helper needs: *is this page currently standing
 * in for this task?*
 *
 * Three tasks land the user somewhere and explain themselves when they get
 * there — `find-people` on Search, `customize` on profile/theme settings,
 * `interact` on the feed — and all three were answering that question with the
 * same twelve lines of latch-and-clear. This is those lines, once. What each
 * flow does with the answer stays its own: customize also opens on a landed
 * substep, interact also holds through its celebration, find-people has neither.
 *
 * Two signals, deliberately, because neither is sufficient alone:
 *
 *  - **Route state**, latched on arrival. `startPath` writes `activePath` to
 *    encrypted settings, which is a round trip; without the latch the helper
 *    would be missing for the first moments on exactly the page the user was
 *    just sent to. It is cleared from history immediately after it is read, so a
 *    refresh or a Back can't re-trigger it, and the latch keeps it true for as
 *    long as this page stays mounted.
 *  - **`activePath`**, from persisted state, which is what makes the guidance
 *    survive a reload, a second tab, a wander away and back, and a device
 *    switch. It is also what retires the guidance: starting another task moves
 *    `activePath`, so a page can never keep explaining a task the user has left.
 *
 * Presentational only. Nothing here completes, starts, or persists anything —
 * completion is `useMissionEngine`'s from real product state, which is why a
 * user may ignore every one of these cards and still finish the mission.
 */
export function useMissionFlowEntry(task: PostOnboardingPathId): {
  /** This navigation, or the persisted mission, points at this task. */
  startedViaMission: boolean;
  /** The mission itself is running (not completed, not skipped). */
  isActive: boolean;
  /** This task is already finished. */
  pathCompleted: boolean;
} {
  const location = useLocation();
  const navigate = useNavigate();
  const { state, isActive } = usePostOnboardingGuide();

  const [arrivedViaRoute, setArrivedViaRoute] = useState(() =>
    isMissionTaskState(location.state, task),
  );

  useEffect(() => {
    if (!isMissionTaskState(location.state, task)) return;
    setArrivedViaRoute(true);
    // Read once, then dropped from history — the user stays exactly where they
    // are, and a Back doesn't replay the mission's navigation.
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate, task]);

  return {
    startedViaMission: arrivedViaRoute || state?.activePath === task,
    isActive,
    pathCompleted: state?.paths[task] === 'completed',
  };
}
