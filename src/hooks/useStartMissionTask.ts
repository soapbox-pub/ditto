import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { usePostOnboardingGuide } from '@/hooks/usePostOnboardingGuide';
import { MISSION_TASK_ROUTES, type MissionTaskState } from '@/lib/missionTasks';
import type { PostOnboardingPathId } from '@/lib/postOnboardingGuide';

/**
 * The one reusable "start a mission task" action, shared by every mission
 * surface so `/missions` and the sidebar widget can never diverge.
 *
 * Starting a task **only navigates** (plus route state for the two guided
 * flows) and records which task the user launched. It never marks anything
 * complete — completion belongs to `useMissionEngine`, which watches real
 * product state. A user who taps a task and immediately backs out has done
 * nothing, and the mission reflects that.
 *
 * @param onStart optional side effect fired the instant a task is started (e.g.
 *   surfaces use it to silence their attention cue).
 */
export function useStartMissionTask(onStart?: () => void) {
  const navigate = useNavigate();
  const { startPath } = usePostOnboardingGuide();

  return useCallback(
    (pathId: PostOnboardingPathId) => {
      onStart?.();
      void startPath(pathId);

      // One navigation for every task, carrying the same route state: *the
      // mission sent you here, for this task*. Each destination decides what
      // that means — the home feed opens the composer for `post-small`, and the
      // three guided tasks show their helper card straight away rather than
      // waiting for `startPath` to come back from encrypted settings. None of
      // them treats it as the truth about the mission; that stays persisted.
      const state: MissionTaskState = { missionTask: pathId };
      navigate(MISSION_TASK_ROUTES[pathId], { state });
    },
    [navigate, startPath, onStart],
  );
}
