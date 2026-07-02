// src/blobbi/actions/index.ts

// Components
export { PlayMusicModal } from './components/PlayMusicModal';
export { InlineMusicPlayer } from './components/InlineMusicPlayer';
export { InlineSingCard } from './components/InlineSingCard';

// Hooks
export { useBlobbiUseInventoryItem } from './hooks/useBlobbiUseInventoryItem';
export type { UseItemRequest, UseItemResult, UseBlobbiUseInventoryItemParams } from './hooks/useBlobbiUseInventoryItem';

export { useBlobbiEvolve } from './hooks/useBlobbiStageTransition';
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
} from './hooks/useBlobbiIncubation';

export { useActiveTaskProcess, filterPersistentTasks as filterPersistentTasksFromProcess, filterDynamicTasks } from '@blobbi/react/hooks/useActiveTaskProcess';
export type { TaskProcessType, TaskProcessConfig, ActiveTaskProcessResult } from '@blobbi/react/hooks/useActiveTaskProcess';

export { 
  useHatchTasks, 
  filterPersistentTasks,
  KIND_THEME_DEFINITION,
  KIND_COLOR_MOMENT,
  HATCH_REQUIRED_INTERACTIONS,
  REQUIRED_INTERACTIONS, // Legacy export
} from '@blobbi/react/hooks/useHatchTasks';
export type { HatchTask, HatchTasksResult, TaskType } from '@blobbi/react/hooks/useHatchTasks';

export {
  useEvolveTasks,
  KIND_PROFILE_TABS,
  EVOLVE_REQUIRED_THEMES,
  EVOLVE_REQUIRED_COLOR_MOMENTS,
  EVOLVE_REQUIRED_INTERACTIONS,
  EVOLVE_STAT_THRESHOLD,
} from '@blobbi/react/hooks/useEvolveTasks';
export type { EvolveTasksResult } from '@blobbi/react/hooks/useEvolveTasks';

export { useBlobbiDirectAction, DIRECT_ACTION_HAPPINESS_EFFECTS } from './hooks/useBlobbiDirectAction';
export type { DirectActionRequest, DirectActionResult, UseBlobbiDirectActionParams } from './hooks/useBlobbiDirectAction';

export { useAudioPlayback } from './hooks/useAudioPlayback';
export type { PlaybackState, PlaybackError, UseAudioPlaybackOptions, UseAudioPlaybackReturn } from './hooks/useAudioPlayback';

// Track catalog
export { 
  BLOBBI_TRACK_CATALOG,
  getAllTracks,
  getTrackById,
  formatTrackDuration,
  type BlobbiTrack,
} from './lib/blobbi-track-catalog';

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
  type SelectedTrack,
} from './lib/blobbi-activity-state';

// Re-export stat bounds from canonical source
export { STAT_MIN, STAT_MAX } from '@blobbi/core/blobbi';

// Utilities
export {
  // Types
  type InventoryAction,
  type DirectAction,
  type BlobbiAction,
  type ItemUsabilityResult,
  type StatChangeWithSegments,
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
  decrementStorageItem,
  canUseAction,
  canUseDirectAction,
  isActionVisibleForStage,
  canUseInventoryItems,
  getStageRestrictionMessage,
  previewStatChangesWithSegments,
  hasMedicineEffectForEgg,
  hasHygieneEffectForEgg,
  canUseItemForStage,
  getActionForItem,
} from './lib/blobbi-action-utils';

// Daily Missions
export { useDailyMissions } from '@blobbi/react/hooks/useDailyMissions';
export type { DailyMissionView, UseDailyMissionsResult } from '@blobbi/react/hooks/useDailyMissions';
export { useAwardDailyXp, useClaimMissionReward } from './hooks/useClaimMissionReward';
export { usePersistEvolutionProgress } from '@blobbi/react/hooks/usePersistEvolutionProgress';
export type { PersistEvolutionProgressOptions } from '@blobbi/react/hooks/usePersistEvolutionProgress';
export { usePersistDailyProgress } from '@blobbi/react/hooks/usePersistDailyProgress';
export type { PersistDailyProgressOptions } from '@blobbi/react/hooks/usePersistDailyProgress';
export type { AwardDailyXpRequest, AwardDailyXpResult, ClaimMissionRequest, ClaimMissionResult } from './hooks/useClaimMissionReward';
export { useRerollMission } from './hooks/useRerollMission';
export type { RerollMissionRequest, RerollMissionResult } from './hooks/useRerollMission';
export {
  trackDailyMissionProgress,
  trackDailyMissionEvent,
  trackMultipleDailyMissionActions,
} from '@blobbi/react/lib/daily-mission-tracker';
export type {
  DailyMissionAction,
  DailyMissionDefinition,
  Mission,
  TallyMission,
  EventMission,
  MissionsContent,
} from '@blobbi/react/lib/daily-missions';

// Progression
export {
  xpToLevel,
  levelToXp,
  xpProgress,
  xpToNextLevel,
  getUnlocks,
  buildXpTagUpdates,
  MAX_LEVEL,
} from '@blobbi/core/progression';
export type { Unlocks } from '@blobbi/core/progression';

// Missions content model
export {
  parseProfileContent,
  serializeProfileContent,
  isMissionComplete,
  isTallyMission,
  isEventMission,
  missionProgress,
} from '@blobbi/core/missions';
export type { ProfileContent } from '@blobbi/core/missions';

// Item cooldown (extracted to @blobbi/react)
export { isItemOnCooldown, setItemCooldown, subscribeCooldowns } from '@blobbi/react/lib/item-cooldown';
export { ITEM_COOLDOWN_SUCCESS_MS, ITEM_COOLDOWN_FAILURE_MS } from '@blobbi/react/lib/item-cooldown';
export { useItemCooldown } from '@blobbi/react/hooks/useItemCooldown';

// Action XP (extracted to @blobbi/react)
export {
  ACTION_XP,
  INVENTORY_ACTION_XP,
  DIRECT_ACTION_XP,
  POOP_CLEANUP_XP,
  calculateActionXP,
  calculateInventoryActionXP,
  applyXPGain,
  formatXPGain,
} from '@blobbi/react/lib/blobbi-xp';

// Streak tracking (extracted to @blobbi/react)
export {
  calculateStreakUpdate,
  getStreakTagUpdates,
  needsStreakUpdate,
  getStreakStatus,
} from '@blobbi/react/lib/blobbi-streak';
export type {
  StreakUpdateResult,
  StreakTagUpdates,
} from '@blobbi/react/lib/blobbi-streak';

export { useBlobbiCareActivity } from '@blobbi/react/hooks/useBlobbiCareActivity';
export type {
  UseBlobbiCareActivityOptions,
  CareActivityResult,
} from '@blobbi/react/hooks/useBlobbiCareActivity';
