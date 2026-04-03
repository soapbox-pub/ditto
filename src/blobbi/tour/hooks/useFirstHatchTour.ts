/**
 * useFirstHatchTour - State machine for the first-egg hatch tutorial.
 *
 * Orchestration only -- no rendering, no animations.
 * The hook manages:
 * - Ordered step progression
 * - In-memory session state (React useState)
 * - Derived booleans for UI consumption
 * - Safe advance / goTo / complete / reset actions
 *
 * Persistence strategy:
 * - The tour does NOT persist to localStorage.
 * - The Kind 11125 profile tag `blobbi_first_hatch_tour_done` is the
 *   sole authoritative persisted signal.
 * - If the user refreshes mid-tour, the tour re-enters from the
 *   beginning when activation conditions are still met.
 *
 * Activation is handled separately by useFirstHatchTourActivation,
 * which calls `start()` when all preconditions are met.
 */

import { useState, useMemo, useCallback, useRef } from 'react';

import {
  FIRST_HATCH_TOUR_STEPS,
  type FirstHatchTourStepId,
  type TourState,
  type TourActions,
} from '../lib/tour-types';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Pre-computed lookup: stepId -> index */
const STEP_INDEX_MAP = new Map<FirstHatchTourStepId, number>(
  FIRST_HATCH_TOUR_STEPS.map((step, i) => [step.id, i]),
);

/** Index of the last step that is NOT the terminal 'complete' pseudo-step */
const LAST_REAL_STEP_INDEX = FIRST_HATCH_TOUR_STEPS.length - 2;

// ─── In-Memory State Shape ────────────────────────────────────────────────────

interface TourSessionState {
  /** Current step id, or null when not started */
  currentStepId: FirstHatchTourStepId | null;
  /** Whether the tour was completed this session */
  completed: boolean;
}

const INITIAL_SESSION_STATE: TourSessionState = {
  currentStepId: null,
  completed: false,
};

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
  // ── In-memory session state ──
  const [session, setSession] = useState<TourSessionState>(INITIAL_SESSION_STATE);

  // Stable ref so callbacks never go stale.
  const sessionRef = useRef(session);
  sessionRef.current = session;

  // ── Actions ──

  const start = useCallback(() => {
    const s = sessionRef.current;
    // No-op if already active or completed this session
    if (s.completed || s.currentStepId !== null) return;

    const firstStep = FIRST_HATCH_TOUR_STEPS[0];
    if (!firstStep) return;

    setSession({ currentStepId: firstStep.id, completed: false });
  }, []);

  const advance = useCallback(() => {
    const s = sessionRef.current;
    if (s.completed || s.currentStepId === null) return;

    const currentIndex = STEP_INDEX_MAP.get(s.currentStepId);
    if (currentIndex === undefined) return;

    const nextIndex = currentIndex + 1;
    if (nextIndex >= FIRST_HATCH_TOUR_STEPS.length) {
      setSession({ currentStepId: null, completed: true });
      return;
    }

    const nextStep = FIRST_HATCH_TOUR_STEPS[nextIndex];
    if (nextStep.id === 'complete') {
      setSession({ currentStepId: null, completed: true });
    } else {
      setSession((prev) => ({ ...prev, currentStepId: nextStep.id }));
    }
  }, []);

  const goTo = useCallback((stepId: FirstHatchTourStepId) => {
    if (!STEP_INDEX_MAP.has(stepId)) {
      throw new Error(`[FirstHatchTour] Unknown step id: "${stepId}"`);
    }

    if (stepId === 'complete') {
      setSession({ currentStepId: null, completed: true });
    } else {
      setSession({ currentStepId: stepId, completed: false });
    }
  }, []);

  const complete = useCallback(() => {
    setSession({ currentStepId: null, completed: true });
  }, []);

  const reset = useCallback(() => {
    setSession(INITIAL_SESSION_STATE);
  }, []);

  // ── Derived state ──

  const currentStepIndex = session.currentStepId !== null
    ? (STEP_INDEX_MAP.get(session.currentStepId) ?? -1)
    : -1;

  const state = useMemo((): TourState<FirstHatchTourStepId> => {
    const isActive = session.currentStepId !== null && !session.completed;
    const totalSteps = FIRST_HATCH_TOUR_STEPS.length;

    return {
      isActive,
      currentStepId: session.currentStepId,
      currentStepIndex,
      totalSteps,
      isLastStep: currentStepIndex === LAST_REAL_STEP_INDEX,
      isCompleted: session.completed,
      progress: session.completed
        ? 1
        : currentStepIndex >= 0
          ? currentStepIndex / LAST_REAL_STEP_INDEX
          : 0,
    };
  }, [session.currentStepId, session.completed, currentStepIndex]);

  const actions = useMemo((): TourActions<FirstHatchTourStepId> => ({
    start,
    advance,
    goTo,
    complete,
    reset,
  }), [start, advance, goTo, complete, reset]);

  // ── Convenience helpers ──

  const isStep = useCallback(
    (stepId: FirstHatchTourStepId) => session.currentStepId === stepId,
    [session.currentStepId],
  );

  const isAnyStep = useCallback(
    (...stepIds: FirstHatchTourStepId[]) => {
      return session.currentStepId !== null && stepIds.includes(session.currentStepId);
    },
    [session.currentStepId],
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
