import { useMissionFlowEntry } from '@/hooks/useMissionFlowEntry';
import { usePostOnboardingGuide } from '@/hooks/usePostOnboardingGuide';
import {
  isCustomizeProfileDone,
  isCustomizeThemeDone,
} from '@/lib/postOnboardingGuide';

/**
 * View-side state for the guided two-step `customize` ("Make it feel like me")
 * flow, used by the profile-settings and themes pages to decide whether to show
 * their helper card and which step it should describe.
 *
 * This hook is **presentational only** — it never completes anything. Both
 * substeps are detected by `useMissionEngine` from real product state (a kind-0
 * republished with meaningful fields; an active theme that differs from the
 * mission's baseline), so the helper card can't get out of sync with what the
 * user actually did, and closing the page mid-flow loses nothing.
 *
 * The flow is considered *in progress* when the mission is active, the
 * customize task isn't already complete, and either:
 *  - this is the task the mission has the user on (`useMissionFlowEntry`), or
 *  - a substep has already landed — so navigating straight to the themes page
 *    after step 1 still shows the right step, even from a fresh tab that never
 *    saw the mission's navigation.
 *
 * ### Why one task with two steps
 *
 * Profile and theme are modelled as substeps of a single `customize` task
 * rather than two top-level tasks. The mission's task list is the unit of
 * progress the user sees ("2/4") and its ids are published on the badge claim;
 * splitting customize would have changed both, and "make it feel like me" reads
 * as one intention with two halves rather than two separate errands. The
 * substep record keeps each half individually recoverable, which is what the
 * two-step model actually needed.
 */
export function useCustomizeMissionFlow() {
  const { state } = usePostOnboardingGuide();
  const { startedViaMission, isActive, pathCompleted } = useMissionFlowEntry('customize');

  const profileDone = isCustomizeProfileDone(state);
  const themeDone = isCustomizeThemeDone(state);

  const flowActive =
    isActive && !pathCompleted && (startedViaMission || profileDone || themeDone);

  return {
    /** Whether the customize flow is in progress and relevant on this page. */
    flowActive,
    /** Whether the profile substep is done. */
    profileDone,
    /** Whether the theme substep is done. */
    themeDone,
    /** Whether the whole customize task is complete. */
    pathCompleted,
  };
}
