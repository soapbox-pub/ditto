/**
 * Adult Blobbi Module
 * 
 * Self-contained module for adult stage Blobbi visuals and customization.
 * This module includes:
 * - Adult SVG assets (awake and sleeping variants for each form)
 * - SVG resolution and loading utilities
 * - Color and customization utilities
 * - Type definitions
 * 
 * This module is designed to be portable and can be moved to other projects.
 */

// Types
export type { 
  AdultForm,
  AdultVariant,
  AdultSvgCustomization,
  AdultSvgResolverOptions,
} from './types/adult.types';

export {
  ADULT_FORMS,
  extractAdultCustomization,
  isValidAdultForm,
  getDefaultAdultForm,
  resolveAdultForm,
  deriveAdultFormFromSeed,
} from './types/adult.types';

// SVG Resolution
export {
  getAdultBaseSvg,
  getAdultSleepingSvg,
  getAdultSvgByVariant,
  resolveAdultSvg,
  resolveAdultSvgWithForm,
  getAvailableAdultForms,
  preloadAdultSvgs,
} from './lib/adult-svg-resolver';

// SVG Customization
export {
  customizeAdultSvg,
  customizeAdultSvgFromBlobbi,
} from './lib/adult-svg-customizer';
