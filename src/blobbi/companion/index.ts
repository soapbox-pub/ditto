/**
 * Blobbi Companion Module
 * 
 * A modular companion system for rendering an interactive Blobbi
 * that roams the screen and responds to user interaction.
 * 
 * Usage:
 * ```tsx
 * import { BlobbiCompanionLayer } from '@/blobbi/companion';
 * 
 * // In your app root:
 * <BlobbiCompanionLayer />
 * ```
 */

// ─── Components ───────────────────────────────────────────────────────────────

export { BlobbiCompanionLayer } from './components/BlobbiCompanionLayer';
export { BlobbiCompanion } from './components/BlobbiCompanion';
export { BlobbiCompanionVisual } from './components/BlobbiCompanionVisual';

// ─── Hooks ────────────────────────────────────────────────────────────────────

export { useBlobbiCompanion } from './hooks/useBlobbiCompanion';
export { useBlobbiCompanionData } from './hooks/useBlobbiCompanionData';
export { useBlobbiCompanionState } from './hooks/useBlobbiCompanionState';
export { useBlobbiCompanionMotion } from './hooks/useBlobbiCompanionMotion';
export { useBlobbiCompanionGaze } from './hooks/useBlobbiCompanionGaze';

// ─── Core ─────────────────────────────────────────────────────────────────────

export { DEFAULT_COMPANION_CONFIG, calculateWalkSpeed, randomDuration } from './core/companionConfig';
export {
  createInitialMotion,
  createInitialGaze,
  decideNextAction,
  updateMotion,
  startDrag,
  updateDragPosition,
  endDrag,
  updateGaze,
  calculateEyeOffset,
  generateRandomGazeOffset,
} from './core/companionMachine';

// ─── Types ────────────────────────────────────────────────────────────────────

export type {
  CompanionState,
  CompanionDirection,
  GazeMode,
  Position,
  Velocity,
  MovementBounds,
  CompanionMotion,
  EyeOffset,
  GazeState,
  CompanionData,
  CompanionConfig,
  CompanionContextValue,
  CompanionEvent,
} from './types/companion.types';

// ─── Utils ────────────────────────────────────────────────────────────────────

export {
  calculateMovementBounds,
  calculateGroundY,
  calculateMainContentLeftEdge,
  calculateEntryPosition,
  calculateRestingPosition,
  lerp,
  easeOutCubic,
  easeInOutCubic,
  distance,
  clamp,
} from './utils/movement';

export {
  createEntryAnimation,
  calculateEntryAnimation,
  calculateIdleBob,
  calculateWalkBounce,
  smoothTransition,
} from './utils/animation';
