/**
 * Baby Blobbi Module
 * 
 * Self-contained module for baby stage Blobbi visuals and customization.
 * This module includes:
 * - Baby SVG assets (awake and sleeping)
 * - SVG resolution and loading utilities
 * - Color and customization utilities
 * - Type definitions
 * 
 * This module is designed to be portable and can be moved to other projects.
 */

// Types
export type { 
  BabyVariant, 
  BabySvgCustomization,
  BabySvgResolverOptions 
} from './types/baby.types';

export { extractBabyCustomization } from './types/baby.types';

// SVG Resolution
export {
  getBabyBaseSvg,
  getBabySleepingSvg,
  getBabySvgByVariant,
  resolveBabySvg,
  preloadBabySvgs,
} from './lib/baby-svg-resolver';

// SVG Customization
export {
  customizeBabySvg,
  customizeBabySvgFromBlobbi,
} from './lib/baby-svg-customizer';
