import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { usePostOnboardingGuide } from '@/hooks/usePostOnboardingGuide';
import {
  MISSION_TASK_ROUTES,
  type MissionComposeState,
  type MissionCustomizeState,
} from '@/lib/missionTasks';
import type { PostOnboardingPathId } from '@/lib/postOnboardingGuide';

/**
 * The one reusable "start a mission task" action, shared by every mission
 * surface so the `/missions` page and the feed card can never diverge.
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

      switch (pathId) {
        case 'post-small': {
          // Open the composer on the home feed via route state. A fresh compose
          // modal means we never clobber the inline composer's in-progress
          // draft in place — `Index` decides whether to prefill.
          const state: MissionComposeState = { missionTask: 'post-small' };
          navigate(MISSION_TASK_ROUTES['post-small'], { state });
          break;
        }
        case 'customize': {
          // Start the guided two-step customize flow. The route state only
          // *shows* the helper card; both substeps still complete on real
          // product state (a saved profile, a changed theme).
          const state: MissionCustomizeState = { missionTask: 'customize' };
          navigate(MISSION_TASK_ROUTES.customize, { state });
          break;
        }
        default:
          navigate(MISSION_TASK_ROUTES[pathId]);
          break;
      }
    },
    [navigate, startPath, onStart],
  );
}
