/**
 * Blobbi Onboarding Module
 * 
 * Provides components and hooks for the Blobbi onboarding flow:
 * 1. Auto profile creation (using kind 0 name)
 * 2. Adoption question
 * 3. Egg preview with reroll/adopt
 */

// Components
export { BlobbiAdoptionStep } from './components/BlobbiAdoptionStep';
export { BlobbiEggPreviewCard } from './components/BlobbiEggPreviewCard';
export { BlobbiAdoptionConfirmDialog } from './components/BlobbiAdoptionConfirmDialog';
export { BlobbiOnboardingFlow } from './components/BlobbiOnboardingFlow';

// Hooks
export { useBlobbiOnboarding } from './hooks/useBlobbiOnboarding';
export type {
  OnboardingStep,
  OnboardingState,
  OnboardingActions,
  UseBlobbiOnboardingResult,
} from './hooks/useBlobbiOnboarding';

// Utilities
export {
  generateEggPreview,
  updatePreviewName,
  previewToEventTags,
  previewToBlobbiCompanion,
} from './lib/blobbi-preview';
export type { BlobbiEggPreview } from './lib/blobbi-preview';
