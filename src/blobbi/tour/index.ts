/**
 * Blobbi Tour Module
 *
 * Provides the orchestration layer for guided tours / tutorials.
 *
 * Currently implements:
 * - First-egg hatch tour (tap crack animation + reveal)
 * - First-egg experience (auto profile + egg creation)
 * - UI walkthrough tour (bottom bar, guide actor)
 *
 * Persistence:
 * - `blobbi_first_hatch_tour_done` — sole signal for hatch tour
 * - `blobbi_ui_tour_done` — sole signal for UI tour (not persisted yet)
 * - No localStorage is used for any tour.
 */

// ── Types (hatch tour infrastructure) ──
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

// ── UI Tour - Types & Constants ──
export type {
  GuideMovement,
  GuideAnchorTarget,
  UITourStepDef,
  UITourStepId,
} from './lib/ui-tour-types';
export {
  buildUITourSteps,
  BAR_ITEM_TOUR_DESCRIPTIONS,
} from './lib/ui-tour-types';

// ── UI Tour - Hooks ──
export { useUITour } from './hooks/useUITour';
export type {
  UITourState,
  UITourActions,
  UseUITourResult,
} from './hooks/useUITour';

// ── UI Tour - Components ──
export { UITourOverlay } from './components/UITourOverlay';
export { GuidedModal } from './components/GuidedModal';
export { MiniBlobbiGuide, GUIDE_SIZE } from './components/MiniBlobbiGuide';

// ── Tour Anchor System ──
export { TourAnchorProvider, useTourAnchors } from './lib/TourAnchorContext';
