/**
 * Blobbi Tour Module
 *
 * Provides the orchestration layer for guided tours / tutorials.
 * Currently implements:
 * - First-egg hatch tour (tap crack animation + reveal)
 * - First-egg experience (auto profile + egg creation)
 *
 * Architecture:
 * - tour-types.ts: Step definitions, persisted state shape, generic types
 * - useFirstHatchTour: State machine (step progression, persistence, actions)
 * - useFirstHatchTourActivation: Precondition guard (auto-starts when eligible)
 * - useFirstEggExperience: Auto-create profile + first egg
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
export type { UseFirstHatchTourOptions, UseFirstHatchTourResult } from './hooks/useFirstHatchTour';

export { useFirstHatchTourActivation } from './hooks/useFirstHatchTourActivation';
export type {
  FirstHatchTourActivationInput,
  FirstHatchTourActivationResult,
} from './hooks/useFirstHatchTourActivation';

// ── First Egg Experience - Hook ──
export { useFirstEggExperience } from './hooks/useFirstEggExperience';
export type {
  FirstEggStep,
  FirstEggExperienceState,
  UseFirstEggExperienceOptions,
  UseFirstEggExperienceResult,
} from './hooks/useFirstEggExperience';

// ── First Hatch Tour - Components ──
export { BlobbiRevealOverlay } from './components/BlobbiRevealOverlay';
