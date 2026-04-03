/**
 * Blobbi Tour Module
 *
 * Provides the orchestration layer for guided tours / tutorials.
 * Currently implements:
 * - First-egg hatch tour (tap crack animation + reveal)
 * - First-egg experience (auto profile + egg creation)
 *
 * Architecture:
 * - tour-types.ts: Step definitions, generic types
 * - useFirstHatchTour: In-memory state machine (step progression, actions)
 * - useFirstHatchTourActivation: Precondition guard (auto-starts when eligible)
 * - useFirstEggExperience: Auto-create profile + first egg
 *
 * Persistence: The Kind 11125 profile tag `blobbi_first_hatch_tour_done`
 * is the sole authoritative persisted signal. No localStorage is used.
 *
 * UI components import from this barrel and read tour state to decide
 * what to render. They call tour actions (advance, goTo, complete) in
 * response to user interactions or animation completions.
 */

// ── Types (generic tour infrastructure) ──
export type {
  TourStepDef,
  TourState,
  TourActions,
} from './lib/tour-types';

// ── First Hatch Tour - Types & Constants ──
export {
  FIRST_HATCH_TOUR_STEPS,
} from './lib/tour-types';
export type {
  FirstHatchTourStepId,
} from './lib/tour-types';

// ── First Hatch Tour - Hooks ──
export { useFirstHatchTour } from './hooks/useFirstHatchTour';
export type { UseFirstHatchTourResult } from './hooks/useFirstHatchTour';

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
