/**
 * Blobbi Visual System Library
 *
 * Centralized exports for the Blobbi visual system.
 *
 * Structure:
 * - types.ts: Shared type definitions
 * - constants.ts: Shared constants (timing, thresholds)
 * - adapters.ts: Data conversion utilities
 * - svg/: SVG manipulation utilities
 *   - colors.ts: Color manipulation
 *   - ids.ts: ID uniquification
 *   - container.ts: Container sizing
 *
 * Animation/rendering modules (not re-exported here):
 * - eye-animation.ts: SVG transformation for eye animation
 * - useBlobbiEyes.ts: Runtime eye animation hook
 * - useExternalEyeOffset.ts: External eye offset control
 * - emotions.ts: Emotion overlay system
 * - status-reactions.ts: Status-based emotion resolution
 */

// Types
export * from './types';

// Constants
export * from './constants';

// Adapters
export { blobbiCompanionToBlobbi, companionDataToBlobbi } from './adapters';

// SVG utilities
export * from './svg';
