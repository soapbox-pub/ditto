// src/blobbi/actions/index.ts

// Components
export { BlobbiActionsModal } from './components/BlobbiActionsModal';
export { BlobbiActionInventoryModal } from './components/BlobbiActionInventoryModal';
export { PlayMusicModal } from './components/PlayMusicModal';
export { SingModal } from './components/SingModal';
export { InlineMusicPlayer } from './components/InlineMusicPlayer';
export { InlineSingCard } from './components/InlineSingCard';
export { HatchTasksPanel } from './components/HatchTasksPanel';
export { TasksPanel } from './components/TasksPanel';
export { BlobbiPostModal } from './components/BlobbiPostModal';
export { StartIncubationDialog } from './components/StartIncubationDialog';
export { StartEvolutionDialog } from './components/StartEvolutionDialog';
export { BlobbiMissionsModal } from './components/BlobbiMissionsModal';
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

export { 
  useStartIncubation, 
  useStopIncubation, 
  useStartEvolution,
  useStopEvolution,
  useSyncTaskCompletions,
} from './hooks/useBlobbiIncubation';
export type {
  StartIncubationMode,
  StartIncubationRequest,
  UseStartIncubationParams,
  StartIncubationResult,
  UseStopIncubationParams,
  StopIncubationResult,
  UseStartEvolutionParams,
  StartEvolutionResult,
  UseStopEvolutionParams,
  StopEvolutionResult,
  UseSyncTaskCompletionsParams,
  TaskCompletionToSync,
} from './hooks/useBlobbiIncubation';

export { useActiveTaskProcess, filterPersistentTasks as filterPersistentTasksFromProcess, filterDynamicTasks } from './hooks/useActiveTaskProcess';
export type { TaskProcessType, TaskProcessConfig, ActiveTaskProcessResult } from './hooks/useActiveTaskProcess';

export { 
  useHatchTasks, 
  getInteractionCount,
  filterPersistentTasks,
  sanitizeToHashtag,
  isValidHatchPost,
  isValidBlobbiPost, // Legacy export
  KIND_THEME_DEFINITION,
  KIND_COLOR_MOMENT,
  HATCH_REQUIRED_INTERACTIONS,
  HATCH_STAT_THRESHOLD,
  REQUIRED_INTERACTIONS, // Legacy export
  BLOBBI_POST_PREFIX,
  BLOBBI_POST_REQUIRED_HASHTAGS,
} from './hooks/useHatchTasks';
export type { HatchTask, HatchTasksResult, TaskType } from './hooks/useHatchTasks';

export {
  useEvolveTasks,
  getEvolveInteractionCount,
  isValidEvolvePost,
  KIND_WALL_EDIT,
  EVOLVE_REQUIRED_THEMES,
  EVOLVE_REQUIRED_COLOR_MOMENTS,
  EVOLVE_REQUIRED_POSTS,
  EVOLVE_REQUIRED_INTERACTIONS,
  EVOLVE_STAT_THRESHOLD,
  BLOBBI_EVOLVE_POST_PREFIX,
} from './hooks/useEvolveTasks';
export type { EvolveTasksResult } from './hooks/useEvolveTasks';

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

// Re-export stat bounds from canonical source
export { STAT_MIN, STAT_MAX } from '@/lib/blobbi';

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

// Daily Missions
export { useDailyMissions } from './hooks/useDailyMissions';
export type { UseDailyMissionsResult } from './hooks/useDailyMissions';
export { useClaimMissionReward } from './hooks/useClaimMissionReward';
export type { ClaimMissionRequest, ClaimMissionResult } from './hooks/useClaimMissionReward';
export {
  trackDailyMissionProgress,
  trackMultipleDailyMissionActions,
} from './lib/daily-mission-tracker';
export type {
  DailyMission,
  DailyMissionAction,
  DailyMissionDefinition,
  DailyMissionsState,
} from './lib/daily-missions';
