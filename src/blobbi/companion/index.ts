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
export { useBlobbiAttention } from './hooks/useBlobbiAttention';
export { useBlobbiEntryAnimation } from './hooks/useBlobbiEntryAnimation';
export { useTypingAttention } from './hooks/useTypingAttention';

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
  EntryType,
  EntryPhase,
  InspectionDirection,
  EntryState,
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
  AttentionTarget,
  AttentionPriority,
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
  calculateFallEntryAnimation,
  calculateRiseEntryAnimation,
  calculateFloatAnimation,
  calculateIdleBob,
  calculateWalkBounce,
  smoothTransition,
  generateInspectionOrder,
  getInspectionEyeOffset,
} from './utils/animation';

export type { VerticalEntryConfig, VerticalEntryResult, FloatOffset } from './utils/animation';

// ─── Sidebar Navigation ───────────────────────────────────────────────────────

export {
  getSidebarIdForPath,
  getSidebarIndex,
  compareRoutes,
  getEntryDirection,
} from './utils/sidebarNavigation';

export type { NavigationDirection, NavigationComparison } from './utils/sidebarNavigation';

// ─── Interaction ──────────────────────────────────────────────────────────────

export {
  useCompanionActionMenu,
  useClickDetection,
  CompanionActionMenu,
  HangingItems,
  MENU_ACTIONS,
  INITIAL_MENU_STATE,
  DEFAULT_CLICK_CONFIG,
  getMenuActionConfig,
  getItemCategoryForAction,
} from './interaction';

export type {
  CompanionMenuAction,
  MenuActionConfig,
  CompanionItem,
  CompanionMenuState,
  ClickDetectionConfig,
} from './interaction';
