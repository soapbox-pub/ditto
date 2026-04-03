/**
 * useFirstHatchTour - State machine for the first-egg hatch tutorial.
 *
 * Orchestration only -- no rendering, no animations.
 * The hook manages:
 * - Ordered step progression
 * - Persisted state via localStorage (survives refresh / close)
 * - Derived booleans for UI consumption
 * - Safe advance / goTo / complete / reset actions
 *
 * Activation is handled separately by useFirstHatchTourActivation,
 * which calls `start()` when all preconditions are met.
 *
 * ────────────────────────────────────────────────────────────────
 * Future integration points
 * ────────────────────────────────────────────────────────────────
 * 1. BlobbiPage (or a wrapper) calls useFirstHatchTourActivation
 *    to decide whether to start the tour.
 * 2. UI components read `state.currentStepId` and render overlays,
 *    spotlights, modals, or animation cues accordingly.
 * 3. Animation components call `actions.advance()` when their
 *    sequence finishes (for autoAdvance steps).
 * 4. Interactive steps (e.g. "click the egg") call `actions.advance()`
 *    on the user interaction.
 * 5. EggGraphic receives a visual-state prop derived from
 *    `state.currentStepId` -- it does NOT own the tour logic.
 */

import { useMemo, useCallback, useRef } from 'react';

import { useLocalStorage } from '@/hooks/useLocalStorage';

import {
  FIRST_HATCH_TOUR_STEPS,
  FIRST_HATCH_TOUR_DEFAULT_STATE,
  type FirstHatchTourStepId,
  type FirstHatchTourPersistedState,
  type TourState,
  type TourActions,
} from '../lib/tour-types';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * localStorage key for the first hatch tour state.
 * Not user-scoped because onboarding state is device-local and the tour
 * is inherently tied to "first ever egg on this device". If multi-user
 * support on the same device becomes a concern, scope by pubkey.
 */
const STORAGE_KEY = 'blobbi:tour:first-hatch';

/** Pre-computed lookup: stepId -> index */
const STEP_INDEX_MAP = new Map<FirstHatchTourStepId, number>(
  FIRST_HATCH_TOUR_STEPS.map((step, i) => [step.id, i]),
);

/** Index of the last step that is NOT the terminal 'complete' pseudo-step */
const LAST_REAL_STEP_INDEX = FIRST_HATCH_TOUR_STEPS.length - 2;

// ─── Result Type ──────────────────────────────────────────────────────────────

export interface UseFirstHatchTourResult {
  /** Reactive tour state for UI consumption */
  state: TourState<FirstHatchTourStepId>;
  /** Actions to drive the tour forward */
  actions: TourActions<FirstHatchTourStepId>;
  /**
   * Convenience: check if the current step matches a given id.
   * Useful for conditional rendering: `isStep('egg_crack_stage_1')`.
   */
  isStep: (stepId: FirstHatchTourStepId) => boolean;
  /**
   * Convenience: check if the current step is one of the given ids.
   * Useful for grouping: `isAnyStep('egg_crack_stage_1', 'egg_crack_stage_2', 'egg_crack_stage_3')`.
   */
  isAnyStep: (...stepIds: FirstHatchTourStepId[]) => boolean;
  /**
   * The current step definition (with autoAdvance metadata), or null.
   */
  currentStepDef: (typeof FIRST_HATCH_TOUR_STEPS)[number] | null;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useFirstHatchTour(): UseFirstHatchTourResult {
  // ── Persisted state ──
  const [persisted, setPersisted] = useLocalStorage<FirstHatchTourPersistedState>(
    STORAGE_KEY,
    FIRST_HATCH_TOUR_DEFAULT_STATE,
  );

  // Stable ref to current persisted state so callbacks never go stale.
  const persistedRef = useRef(persisted);
  persistedRef.current = persisted;

  // ── Helpers ──

  const updatePersisted = useCallback(
    (patch: Partial<FirstHatchTourPersistedState>) => {
      setPersisted((prev) => ({
        ...prev,
        ...patch,
        updatedAt: Date.now(),
      }));
    },
    [setPersisted],
  );

  // ── Actions ──

  const start = useCallback(() => {
    const p = persistedRef.current;
    // No-op if already active or completed
    if (p.completed || p.currentStepId !== null) return;

    const firstStep = FIRST_HATCH_TOUR_STEPS[0];
    if (!firstStep) return;

    updatePersisted({ currentStepId: firstStep.id });
  }, [updatePersisted]);

  const advance = useCallback(() => {
    const p = persistedRef.current;
    if (p.completed || p.currentStepId === null) return;

    const currentIndex = STEP_INDEX_MAP.get(p.currentStepId);
    if (currentIndex === undefined) return;

    const nextIndex = currentIndex + 1;
    if (nextIndex >= FIRST_HATCH_TOUR_STEPS.length) {
      // Past the end -- complete
      updatePersisted({ currentStepId: null, completed: true });
      return;
    }

    const nextStep = FIRST_HATCH_TOUR_STEPS[nextIndex];
    if (nextStep.id === 'complete') {
      // Reaching the 'complete' terminal step means the tour is done
      updatePersisted({ currentStepId: null, completed: true });
    } else {
      updatePersisted({ currentStepId: nextStep.id });
    }
  }, [updatePersisted]);

  const goTo = useCallback(
    (stepId: FirstHatchTourStepId) => {
      if (!STEP_INDEX_MAP.has(stepId)) {
        throw new Error(`[FirstHatchTour] Unknown step id: "${stepId}"`);
      }

      if (stepId === 'complete') {
        updatePersisted({ currentStepId: null, completed: true });
      } else {
        updatePersisted({ currentStepId: stepId, completed: false });
      }
    },
    [updatePersisted],
  );

  const complete = useCallback(() => {
    updatePersisted({ currentStepId: null, completed: true });
  }, [updatePersisted]);

  const reset = useCallback(() => {
    setPersisted(FIRST_HATCH_TOUR_DEFAULT_STATE);
  }, [setPersisted]);

  // ── Derived state ──

  const currentStepIndex = persisted.currentStepId !== null
    ? (STEP_INDEX_MAP.get(persisted.currentStepId) ?? -1)
    : -1;

  const state = useMemo((): TourState<FirstHatchTourStepId> => {
    const isActive = persisted.currentStepId !== null && !persisted.completed;
    const totalSteps = FIRST_HATCH_TOUR_STEPS.length;

    return {
      isActive,
      currentStepId: persisted.currentStepId,
      currentStepIndex,
      totalSteps,
      isLastStep: currentStepIndex === LAST_REAL_STEP_INDEX,
      isCompleted: persisted.completed,
      progress: persisted.completed
        ? 1
        : currentStepIndex >= 0
          ? currentStepIndex / LAST_REAL_STEP_INDEX
          : 0,
    };
  }, [persisted.currentStepId, persisted.completed, currentStepIndex]);

  const actions = useMemo((): TourActions<FirstHatchTourStepId> => ({
    start,
    advance,
    goTo,
    complete,
    reset,
  }), [start, advance, goTo, complete, reset]);

  // ── Convenience helpers ──

  const isStep = useCallback(
    (stepId: FirstHatchTourStepId) => persisted.currentStepId === stepId,
    [persisted.currentStepId],
  );

  const isAnyStep = useCallback(
    (...stepIds: FirstHatchTourStepId[]) => {
      return persisted.currentStepId !== null && stepIds.includes(persisted.currentStepId);
    },
    [persisted.currentStepId],
  );

  const currentStepDef = currentStepIndex >= 0
    ? FIRST_HATCH_TOUR_STEPS[currentStepIndex]
    : null;

  return {
    state,
    actions,
    isStep,
    isAnyStep,
    currentStepDef,
  };
}
