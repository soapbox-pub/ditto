/**
 * useUITour - State machine for the Blobbi UI walkthrough tour.
 *
 * In-memory only. The Kind 11125 profile tag `blobbi_ui_tour_done`
 * is the sole persisted completion signal (set externally by the caller
 * when the tour completes). This hook never writes to localStorage or
 * Nostr — it only manages the step progression.
 *
 * Supports forward and backward navigation so the user can revisit
 * previous steps.
 */

import { useState, useMemo, useCallback, useRef } from 'react';

import type { UITourStepDef } from '../lib/ui-tour-types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UITourSessionState {
  currentStepIndex: number | null;
  completed: boolean;
}

const INITIAL_STATE: UITourSessionState = {
  currentStepIndex: null,
  completed: false,
};

export interface UITourState {
  isActive: boolean;
  currentStep: UITourStepDef | null;
  currentStepIndex: number;
  totalSteps: number;
  isFirstStep: boolean;
  isLastContentStep: boolean;
  isCompleted: boolean;
}

export interface UITourActions {
  /** Start the tour from the first step */
  start: () => void;
  /** Advance to the next step. Completes if on the last content step. */
  next: () => void;
  /** Go back to the previous step. No-op if on the first step. */
  prev: () => void;
  /** Mark the tour as completed */
  complete: () => void;
  /** Reset the tour (dev only) */
  reset: () => void;
}

export interface UseUITourResult {
  state: UITourState;
  actions: UITourActions;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useUITour(steps: UITourStepDef[]): UseUITourResult {
  const [session, setSession] = useState<UITourSessionState>(INITIAL_STATE);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  // Last content step is the one before 'complete'
  const lastContentIndex = useMemo(() => {
    const completeIdx = steps.findIndex(s => s.id === 'complete');
    return completeIdx > 0 ? completeIdx - 1 : steps.length - 1;
  }, [steps]);

  const start = useCallback(() => {
    const s = sessionRef.current;
    if (s.completed || s.currentStepIndex !== null) return;
    if (steps.length === 0) return;
    setSession({ currentStepIndex: 0, completed: false });
  }, [steps.length]);

  const next = useCallback(() => {
    const s = sessionRef.current;
    if (s.completed || s.currentStepIndex === null) return;

    const nextIdx = s.currentStepIndex + 1;
    // If next step is 'complete' or past the end, mark completed
    if (nextIdx >= steps.length || steps[nextIdx].id === 'complete') {
      setSession({ currentStepIndex: null, completed: true });
    } else {
      setSession(prev => ({ ...prev, currentStepIndex: nextIdx }));
    }
  }, [steps]);

  const prev = useCallback(() => {
    const s = sessionRef.current;
    if (s.completed || s.currentStepIndex === null || s.currentStepIndex === 0) return;
    setSession(prev => ({ ...prev, currentStepIndex: prev.currentStepIndex! - 1 }));
  }, []);

  const complete = useCallback(() => {
    setSession({ currentStepIndex: null, completed: true });
  }, []);

  const reset = useCallback(() => {
    setSession(INITIAL_STATE);
  }, []);

  // Derived state
  const currentStep = session.currentStepIndex !== null
    ? (steps[session.currentStepIndex] ?? null)
    : null;

  const state = useMemo((): UITourState => ({
    isActive: session.currentStepIndex !== null && !session.completed,
    currentStep,
    currentStepIndex: session.currentStepIndex ?? -1,
    totalSteps: steps.length,
    isFirstStep: session.currentStepIndex === 0,
    isLastContentStep: session.currentStepIndex === lastContentIndex,
    isCompleted: session.completed,
  }), [session.currentStepIndex, session.completed, currentStep, steps.length, lastContentIndex]);

  const actions = useMemo((): UITourActions => ({
    start, next, prev, complete, reset,
  }), [start, next, prev, complete, reset]);

  return { state, actions };
}
