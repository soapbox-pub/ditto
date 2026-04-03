/**
 * Blobbi Tour Module
 *
 * Provides the orchestration layer for guided tours / tutorials.
 * Currently implements the first-egg hatch tour.
 *
 * Architecture:
 * - tour-types.ts: Step definitions, persisted state shape, generic types
 * - useFirstHatchTour: State machine (step progression, persistence, actions)
 * - useFirstHatchTourActivation: Precondition guard (auto-starts when eligible)
 *
 * UI components import from this barrel and read tour state to decide
 * what to render. They call tour actions (advance, goTo, complete) in
 * response to user interactions or animation completions.
 */

// ── Types (generic tour infrastructure) ──
export type {
  TourStepDef,
  TourPersistedState,
  TourState,
  TourActions,
} from './lib/tour-types';

// ── First Hatch Tour - Types & Constants ──
export {
  FIRST_HATCH_TOUR_STEPS,
  FIRST_HATCH_TOUR_DEFAULT_STATE,
} from './lib/tour-types';
export type {
  FirstHatchTourStepId,
  FirstHatchTourPersistedState,
} from './lib/tour-types';

// ── First Hatch Tour - Hooks ──
export { useFirstHatchTour } from './hooks/useFirstHatchTour';
export type { UseFirstHatchTourResult } from './hooks/useFirstHatchTour';

export { useFirstHatchTourActivation } from './hooks/useFirstHatchTourActivation';
export type {
  FirstHatchTourActivationInput,
  FirstHatchTourActivationResult,
} from './hooks/useFirstHatchTourActivation';

// ── First Hatch Tour - Components ──
export { FirstHatchTourCard } from './components/FirstHatchTourCard';
