/**
 * Tour System - Core Types
 *
 * Generic, reusable types for step-based guided tours.
 * The tour system is designed to be:
 * - Easy to extend with new tours (define steps + config)
 * - Easy to reorder steps (change the STEPS array)
 * - Persistent across page refreshes (localStorage)
 * - Decoupled from rendering (UI reads state, doesn't own it)
 */

// ─── Generic Tour Infrastructure ──────────────────────────────────────────────

/**
 * A tour step definition.
 *
 * Each step has a unique id and optional metadata that future UI layers
 * can use to decide what to render (spotlights, modals, animations, etc.).
 */
export interface TourStepDef<StepId extends string = string> {
  /** Unique identifier for this step */
  id: StepId;
  /**
   * Whether this step auto-advances (e.g. animations) or waits for
   * an explicit `advance()` / `goTo()` call from the UI.
   * Default: false (manual).
   */
  autoAdvance?: boolean;
}

/**
 * Persisted state for a tour.
 * Stored in localStorage so tours survive refresh / close / return.
 */
export interface TourPersistedState<StepId extends string = string> {
  /** Current step id, or null when the tour is not yet started */
  currentStepId: StepId | null;
  /** Whether the tour has been completed */
  completed: boolean;
  /** Unix ms timestamp of last state change (for debugging / analytics) */
  updatedAt: number;
}

/**
 * Full runtime state exposed by a tour hook.
 */
export interface TourState<StepId extends string = string> {
  /** Whether the tour is currently active (started and not yet completed) */
  isActive: boolean;
  /** Current step id, or null when idle / completed */
  currentStepId: StepId | null;
  /** 0-based index of the current step in the steps array, or -1 */
  currentStepIndex: number;
  /** Total number of steps */
  totalSteps: number;
  /** Whether the current step is the last one before completion */
  isLastStep: boolean;
  /** Whether the tour has been completed (persisted) */
  isCompleted: boolean;
  /** Progress as a fraction 0..1 */
  progress: number;
}

/**
 * Actions exposed by a tour hook.
 */
export interface TourActions<StepId extends string = string> {
  /** Start the tour from the first step (no-op if already active or completed) */
  start: () => void;
  /** Advance to the next step. Completes the tour if on the last step. */
  advance: () => void;
  /** Jump to a specific step by id. Throws if the step doesn't exist. */
  goTo: (stepId: StepId) => void;
  /** Mark the tour as completed and reset to idle. */
  complete: () => void;
  /** Reset the tour entirely (clears persisted state). For dev/testing. */
  reset: () => void;
}

// ─── First Hatch Tour ─────────────────────────────────────────────────────────

/**
 * Step ids for the first-egg hatch tour.
 *
 * Simplified flow (no post mission required):
 * 1. idle                        — initial state (auto-advances immediately)
 * 2. egg_glowing_waiting_click   — egg glows, waiting for user click
 * 3. egg_crack_stage_1           — click 1: crack appears
 * 4. egg_crack_stage_2           — click 2: crack expands
 * 5. egg_crack_stage_3           — click 3: crack reaches edges
 * 6. egg_opening                 — shell opens (auto-advance after animation)
 * 7. egg_hatching                — bright light + baby emerges (auto-advance)
 * 8. reveal                      — show reveal overlay with naming
 * 9. complete                    — terminal, marks tour done
 *
 * The order here matches the intended flow. To reorder steps,
 * change FIRST_HATCH_TOUR_STEPS (the array), not this type.
 */
export type FirstHatchTourStepId =
  | 'idle'
  | 'egg_glowing_waiting_click'
  | 'egg_crack_stage_1'
  | 'egg_crack_stage_2'
  | 'egg_crack_stage_3'
  | 'egg_opening'
  | 'egg_hatching'
  | 'reveal'
  | 'complete';

/**
 * Ordered step definitions for the first hatch tour.
 *
 * To add / remove / reorder steps, edit this array.
 * The tour state machine walks through these in order.
 */
export const FIRST_HATCH_TOUR_STEPS: TourStepDef<FirstHatchTourStepId>[] = [
  { id: 'idle' },
  { id: 'egg_glowing_waiting_click' },
  { id: 'egg_crack_stage_1' },
  { id: 'egg_crack_stage_2' },
  { id: 'egg_crack_stage_3' },
  { id: 'egg_opening', autoAdvance: true },
  { id: 'egg_hatching', autoAdvance: true },
  { id: 'reveal' },
  { id: 'complete' },
];

/**
 * Persisted state shape for the first hatch tour.
 */
export type FirstHatchTourPersistedState = TourPersistedState<FirstHatchTourStepId>;

/**
 * Default persisted state for a brand-new first hatch tour.
 */
export const FIRST_HATCH_TOUR_DEFAULT_STATE: FirstHatchTourPersistedState = {
  currentStepId: null,
  completed: false,
  updatedAt: 0,
};
