import { useEffect, useRef, useState } from 'react';

import { usePostOnboardingGuide } from '@/hooks/usePostOnboardingGuide';
import {
  POST_ONBOARDING_PATH_IDS,
  type PostOnboardingPathId,
} from '@/lib/postOnboardingGuide';

/** How long the bounded completion celebration animates before going quiet. */
const CELEBRATION_DURATION_MS = 2_400;

/**
 * Detects the moment a mission task transitions to completed and returns a
 * short-lived `celebrating` flag that mission surfaces use to play a bounded,
 * tasteful "task counted" reward (a ring pulse, a count pop, a sparkle burst),
 * along with *which* task it was.
 *
 * It watches the shared `completedCount`: whenever it *increases* while the
 * component is mounted, `celebrating` flips true for
 * {@link CELEBRATION_DURATION_MS} then back to false. The first observed count
 * (initial mount / load) is only a baseline — navigating to a surface that
 * already shows progress never replays the animation.
 *
 * `completedPath` names the task that flipped, so a surface can acknowledge the
 * specific thing the user did rather than announcing a generic success. It is
 * derived by diffing the per-task statuses across the same transition, so it
 * cannot disagree with the count that triggered the celebration. When more than
 * one task lands at once (possible when a single write completes a substep and
 * its parent), the first in canonical order wins.
 *
 * Because it keys off persisted, shared state, every surface rendering when the
 * completion lands celebrates in sync. The CSS honors `prefers-reduced-motion`,
 * so reduced-motion users get the progress change without the animation.
 */
export function useMissionCelebration(): {
  celebrating: boolean;
  completedPath?: PostOnboardingPathId;
} {
  const { state, completedCount } = usePostOnboardingGuide();

  const [celebrating, setCelebrating] = useState(false);
  const [completedPath, setCompletedPath] = useState<PostOnboardingPathId | undefined>();
  // The last count we observed. `null` until the first render with a count, so
  // the initial value is a baseline, not a celebration trigger.
  const prevCountRef = useRef<number | null>(null);
  /** Task statuses as of the last *count* observation, for naming the change. */
  const prevPathsRef = useRef(state?.paths);
  // Read through a ref, deliberately. The effect below owns the celebration
  // timer, so it must run only when the count changes — keying it on the state
  // object as well would let any unrelated mission write (a baseline, an intro
  // timestamp) tear down the running timer and strand the celebration on
  // forever, which is exactly the "infinite pulse" this feature must not have.
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const prev = prevCountRef.current;
    const prevPaths = prevPathsRef.current;
    const paths = stateRef.current?.paths;
    prevCountRef.current = completedCount;
    prevPathsRef.current = paths;

    if (prev === null) return; // baseline the first observed count
    if (completedCount <= prev) return; // only a genuine increase counts

    setCompletedPath(
      POST_ONBOARDING_PATH_IDS.find(
        (id) => paths?.[id] === 'completed' && prevPaths?.[id] !== 'completed',
      ),
    );
    setCelebrating(true);
    const timer = setTimeout(() => setCelebrating(false), CELEBRATION_DURATION_MS);
    return () => clearTimeout(timer);
  }, [completedCount]);

  return { celebrating, completedPath };
}
