// src/blobbi/actions/index.ts

// Components
export { BlobbiActionsModal } from './components/BlobbiActionsModal';
export { BlobbiActionInventoryModal } from './components/BlobbiActionInventoryModal';
export { PlayMusicModal } from './components/PlayMusicModal';
export { SingModal } from './components/SingModal';

// Hooks
export { useBlobbiUseInventoryItem } from './hooks/useBlobbiUseInventoryItem';
export type { UseItemRequest, UseItemResult, UseBlobbiUseInventoryItemParams } from './hooks/useBlobbiUseInventoryItem';

export { useBlobbiHatch, useBlobbiEvolve } from './hooks/useBlobbiStageTransition';
export type { 
  UseBlobbiStageTransitionParams, 
  StageTransitionResult,
  CanonicalActionResult,
} from './hooks/useBlobbiStageTransition';

export { useBlobbiDirectAction, DIRECT_ACTION_HAPPINESS_EFFECTS } from './hooks/useBlobbiDirectAction';
export type { DirectActionRequest, DirectActionResult, UseBlobbiDirectActionParams } from './hooks/useBlobbiDirectAction';

// Built-in tracks
export { 
  BLOBBI_BUILTIN_TRACKS,
  getAllBuiltInTracks,
  getBuiltInTrackById,
  formatTrackDuration,
  type BuiltInTrack,
} from './lib/blobbi-builtin-tracks';

// Utilities
export {
  // Types
  type InventoryAction,
  type DirectAction,
  type BlobbiAction,
  type ResolvedInventoryItem,
  type EggStatPreview,
  // Constants
  ACTION_TO_ITEM_TYPE,
  ACTION_METADATA,
  DIRECT_ACTION_METADATA,
  ALL_ACTION_METADATA,
  GENERAL_ITEM_USABLE_STAGES,
  EGG_ALLOWED_ACTIONS,
  EGG_ALLOWED_INVENTORY_ACTIONS,
  EGG_ALLOWED_DIRECT_ACTIONS,
  EGG_VISIBLE_INVENTORY_ACTIONS,
  EGG_VISIBLE_ACTIONS,
  // Functions
  clampStat,
  applyStat,
  applyItemEffects,
  filterInventoryByAction,
  decrementStorageItem,
  canUseAction,
  canUseDirectAction,
  isActionVisibleForStage,
  canUseInventoryItems,
  getStageRestrictionMessage,
  previewStatChanges,
  previewMedicineForEgg,
  previewCleanForEgg,
  hasMedicineEffectForEgg,
  hasHygieneEffectForEgg,
} from './lib/blobbi-action-utils';
