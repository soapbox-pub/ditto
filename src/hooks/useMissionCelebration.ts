import { useEffect, useRef, useState } from 'react';

import { usePostOnboardingGuide } from '@/hooks/usePostOnboardingGuide';

/** How long the bounded completion celebration animates before going quiet. */
const CELEBRATION_DURATION_MS = 2_400;

/**
 * Detects the moment a mission task transitions to completed and returns a
 * short-lived `celebrating` flag that mission surfaces use to play a bounded,
 * tasteful "task counted" reward (a ring pulse, a count pop, a sparkle burst).
 *
 * It watches the shared `completedCount`: whenever it *increases* while the
 * component is mounted, `celebrating` flips true for
 * {@link CELEBRATION_DURATION_MS} then back to false. The first observed count
 * (initial mount / load) is only a baseline — navigating to a surface that
 * already shows progress never replays the animation.
 *
 * Because it keys off persisted, shared state, every surface rendering when the
 * completion lands celebrates in sync. The CSS honors `prefers-reduced-motion`,
 * so reduced-motion users get the progress change without the animation.
 */
export function useMissionCelebration(): { celebrating: boolean } {
  const { completedCount } = usePostOnboardingGuide();

  const [celebrating, setCelebrating] = useState(false);
  // The last count we observed. `null` until the first render with a count, so
  // the initial value is a baseline, not a celebration trigger.
  const prevCountRef = useRef<number | null>(null);

  useEffect(() => {
    const prev = prevCountRef.current;
    prevCountRef.current = completedCount;

    if (prev === null) return; // baseline the first observed count
    if (completedCount <= prev) return; // only a genuine increase counts

    setCelebrating(true);
    const timer = setTimeout(() => setCelebrating(false), CELEBRATION_DURATION_MS);
    return () => clearTimeout(timer);
  }, [completedCount]);

  return { celebrating };
}
