/**
 * Blobbi Onboarding Module
 *
 * Every new egg goes through the immersive hatching ceremony:
 * dark screen, huge egg, click-to-hatch, sentimental birth reveal, naming.
 */

// Components
export { BlobbiOnboardingFlow } from './components/BlobbiOnboardingFlow';
export { BlobbiHatchingCeremony } from './components/BlobbiHatchingCeremony';

// Utilities
export {
  generateEggPreview,
  updatePreviewName,
  previewToEventTags,
  previewToBlobbiCompanion,
} from './lib/blobbi-preview';
export type { BlobbiEggPreview } from './lib/blobbi-preview';
