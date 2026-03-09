// src/blobbi/actions/index.ts

// Components
export { BlobbiActionsModal } from './components/BlobbiActionsModal';
export { BlobbiActionInventoryModal } from './components/BlobbiActionInventoryModal';

// Hooks
export { useBlobbiUseInventoryItem } from './hooks/useBlobbiUseInventoryItem';
export type { UseItemRequest, UseItemResult, UseBlobbiUseInventoryItemParams } from './hooks/useBlobbiUseInventoryItem';

// Utilities
export {
  // Types
  type InventoryAction,
  type ResolvedInventoryItem,
  // Constants
  ACTION_TO_ITEM_TYPE,
  ACTION_METADATA,
  ITEM_USABLE_STAGES,
  // Functions
  clampStat,
  applyStat,
  applyItemEffects,
  filterInventoryByAction,
  decrementStorageItem,
  canUseInventoryItems,
  getStageRestrictionMessage,
  previewStatChanges,
} from './lib/blobbi-action-utils';
