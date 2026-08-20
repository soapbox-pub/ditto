import { useMissionCelebration } from '@/hooks/useMissionCelebration';
import { useMissionFlowEntry } from '@/hooks/useMissionFlowEntry';

/**
 * View-side state for the guided `find-people` ("Find your people") task, used
 * by the Search page to decide whether to show its guidance card.
 *
 * **Presentational only** — it never completes anything. `useMissionEngine`
 * completes the task when the kind-3 follow list actually grows past its
 * baseline, wherever that follow happens.
 *
 * The shape is the interact flow's, minus the parts that task needs and this
 * one doesn't: which entry counts, whether the task is done, and a short hold
 * after it completes so the acknowledgement lands where the user is looking
 * rather than only on a page they may never go back to.
 */
export function useFindPeopleMissionFlow(): {
  /** Whether the guidance belongs on this page right now. */
  flowActive: boolean;
  /** Whether it just completed and should show its success state. */
  completed: boolean;
} {
  const { celebrating, completedPath } = useMissionCelebration();
  const { startedViaMission, isActive, pathCompleted } = useMissionFlowEntry('find-people');

  const inProgress = isActive && !pathCompleted && startedViaMission;
  // Gated on `completedPath` so another task finishing can never resurrect this
  // one's card, and on the entry so it only appears where it was already up.
  const justCompleted =
    celebrating && completedPath === 'find-people' && (startedViaMission || pathCompleted);

  return { flowActive: inProgress || justCompleted, completed: justCompleted };
}
