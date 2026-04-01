/**
 * Blobbi Egg Visual System
 *
 * A self-contained module for rendering Blobbi eggs with special marks,
 * animations, and validation utilities.
 *
 * This module is designed to be portable and can be copied to another
 * project with minimal dependencies (only React is required).
 */

// Import styles once at module root
import './styles/egg-animations.css';

// Components
export { EggGraphic, type EggReactionState, type EggStatusEffects, type EggTourVisualState } from './components/EggGraphic';
export { SpecialMarkRenderer, SpecialMarkFallback } from './components/SpecialMarkRenderer';

// Hooks
export { useSpecialMark, useSpecialMarkCollection } from './hooks/useSpecialMark';

// Validation utilities
export {
  isValidBaseColor,
  isValidSecondaryColor,
  isValidSize,
  isValidPattern,
  isValidEggStatus,
  isValidSpecialMark,
  isValidTitle,
  isValidEyeColor,
  getColorRarity,
  getSizeRarity,
  getSpecialMarkRarity,
  getTitleRarity,
  getEyeColorRarity,
  validateEggProperties,
  // Constants
  VALID_BASE_COLORS,
  VALID_SECONDARY_COLORS,
  VALID_SIZES,
  VALID_PATTERNS,
  VALID_EGG_STATUSES,
  VALID_SPECIAL_MARKS,
  VALID_TITLES,
  VALID_EYE_COLORS,
  ALL_VALID_BASE_COLORS,
  ALL_VALID_SECONDARY_COLORS,
  ALL_VALID_SIZES,
  ALL_VALID_SPECIAL_MARKS,
  ALL_VALID_TITLES,
  ALL_VALID_EYE_COLORS,
} from './lib/blobbi-egg-validation';

// Divine utilities
export {
  isDivineEgg,
  isDivineBlobbi,
  ensureDivineTags,
  syncDivineModelFields,
  createDivineBlobbiProperties,
  validateDivineConsistency,
  createTagMap,
  // Constants
  DIVINE_THEME,
  DIVINE_CROSSOVER_APP,
  DIVINE_BASE_COLOR,
  DIVINE_SPECIAL_MARK,
} from './lib/blobbi-divine-utils';

// Special marks utilities
export {
  isSpecialMarkSupported,
  AVAILABLE_SPECIAL_MARKS,
} from './lib/special-marks-utils';

// Types
export type { EggVisualBlobbi } from './types/egg.types';
export type { EggValidationResult } from './lib/blobbi-egg-validation';
