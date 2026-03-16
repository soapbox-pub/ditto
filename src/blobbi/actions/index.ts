// src/blobbi/actions/index.ts

// Components
export { BlobbiActionsModal } from './components/BlobbiActionsModal';
export { BlobbiActionInventoryModal } from './components/BlobbiActionInventoryModal';

// Hooks
export { useBlobbiUseInventoryItem } from './hooks/useBlobbiUseInventoryItem';
export type { UseItemRequest, UseItemResult, UseBlobbiUseInventoryItemParams } from './hooks/useBlobbiUseInventoryItem';

export { useBlobbiHatch, useBlobbiEvolve } from './hooks/useBlobbiStageTransition';
export type { 
  UseBlobbiStageTransitionParams, 
  StageTransitionResult,
  CanonicalActionResult,
} from './hooks/useBlobbiStageTransition';

// Utilities
export {
  // Types
  type InventoryAction,
  type ResolvedInventoryItem,
  type EggStats,
  type EggMedicineResult,
  type EggStatPreview,
  // Constants
  ACTION_TO_ITEM_TYPE,
  ACTION_METADATA,
  GENERAL_ITEM_USABLE_STAGES,
  EGG_ALLOWED_ACTIONS,
  // Functions
  clampStat,
  applyStat,
  applyItemEffects,
  applyMedicineToEgg,
  filterInventoryByAction,
  decrementStorageItem,
  canUseAction,
  canUseInventoryItems,
  getStageRestrictionMessage,
  previewStatChanges,
  previewMedicineForEgg,
  hasMedicineEffectForEgg,
} from './lib/blobbi-action-utils';
