// src/blobbi/actions/index.ts

// Components
export { BlobbiActionsModal } from './components/BlobbiActionsModal';
export { BlobbiActionInventoryModal } from './components/BlobbiActionInventoryModal';
export { PlayMusicModal } from './components/PlayMusicModal';
export { SingModal } from './components/SingModal';
export { InlineMusicPlayer } from './components/InlineMusicPlayer';
export { InlineSingCard } from './components/InlineSingCard';
export { HatchTasksPanel } from './components/HatchTasksPanel';
export { BlobbiPostModal } from './components/BlobbiPostModal';
export { StartIncubationDialog } from './components/StartIncubationDialog';
export type { AudioSource } from './components/PlayMusicModal';

// Hooks
export { useBlobbiUseInventoryItem } from './hooks/useBlobbiUseInventoryItem';
export type { UseItemRequest, UseItemResult, UseBlobbiUseInventoryItemParams } from './hooks/useBlobbiUseInventoryItem';

export { useBlobbiHatch, useBlobbiEvolve } from './hooks/useBlobbiStageTransition';
export type { 
  UseBlobbiStageTransitionParams, 
  StageTransitionResult,
  CanonicalActionResult,
} from './hooks/useBlobbiStageTransition';

export { useStartIncubation, useUpdateTaskProgress } from './hooks/useBlobbiIncubation';
export type {
  UseStartIncubationParams,
  StartIncubationResult,
  UseUpdateTaskProgressParams,
  UpdateTaskProgressRequest,
} from './hooks/useBlobbiIncubation';

export { 
  useHatchTasks, 
  getInteractionCount,
  KIND_THEME_DEFINITION,
  KIND_COLOR_MOMENT,
  REQUIRED_INTERACTIONS,
  BLOBBI_POST_PREFIX,
  BLOBBI_POST_REQUIRED_HASHTAGS,
} from './hooks/useHatchTasks';
export type { HatchTask, HatchTasksResult } from './hooks/useHatchTasks';

export { useBlobbiDirectAction, DIRECT_ACTION_HAPPINESS_EFFECTS } from './hooks/useBlobbiDirectAction';
export type { DirectActionRequest, DirectActionResult, UseBlobbiDirectActionParams } from './hooks/useBlobbiDirectAction';

export { useAudioPlayback } from './hooks/useAudioPlayback';
export type { PlaybackState, PlaybackError, UseAudioPlaybackOptions, UseAudioPlaybackReturn } from './hooks/useAudioPlayback';

// Built-in tracks
export { 
  BLOBBI_BUILTIN_TRACKS,
  getAllBuiltInTracks,
  getBuiltInTrackById,
  formatTrackDuration,
  type BuiltInTrack,
} from './lib/blobbi-builtin-tracks';

// Activity state
export {
  createMusicActivity,
  createSingActivity,
  createNoActivity,
  type InlineActivityType,
  type InlineActivityState,
  type MusicActivityState,
  type SingActivityState,
  type NoActivityState,
  type BlobbiReactionState,
  type MusicTrackSource,
} from './lib/blobbi-activity-state';

// Utilities
export {
  // Types
  type InventoryAction,
  type DirectAction,
  type BlobbiAction,
  type ResolvedInventoryItem,
  type EggStatPreview,
  type ItemUsabilityResult,
  type IncrementInteractionResult,
  // Constants
  STAT_MIN,
  STAT_MAX,
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
  SHELL_REPAIR_KIT_ID,
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
  canUseItemForStage,
  getActionForItem,
  incrementInteractionTaskTags,
} from './lib/blobbi-action-utils';
