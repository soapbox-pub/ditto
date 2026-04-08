// src/blobbi/rooms/lib/room-types.ts

/**
 * Shared prop types for Blobbi room components.
 *
 * These types are the "contract" that the BlobbiDashboard passes down
 * to each room. They mirror the existing BlobbiDashboard internal state
 * so rooms can reuse all existing logic without duplication.
 */

import type { NostrEvent } from '@nostrify/nostrify';

import type { BlobbiCompanion, BlobbonautProfile, StorageItem } from '@/blobbi/core/lib/blobbi';
import type {
  InventoryAction,
  DirectAction,
  InlineActivityState,
  BlobbiReactionState,
  SelectedTrack,
  StartIncubationMode,
} from '@/blobbi/actions';
import type { useHatchTasks, useEvolveTasks, useDailyMissions } from '@/blobbi/actions';
import type { BlobbiEmotion } from '@/blobbi/ui/lib/emotion-types';
import type { BlobbiVisualRecipe } from '@/blobbi/ui/lib/recipe';
import type { ShopItem } from '@/blobbi/shop/types/shop.types';
import type { BlobbiHouseContent } from '@/blobbi/house/lib/house-types';
import type { BlobbiRoomId } from './room-config';

// ─── Shared Dashboard Context ─────────────────────────────────────────────────

/**
 * Everything a room needs from the dashboard.
 * Passed down by BlobbiRoomShell so rooms don't import dashboard state directly.
 */
export interface BlobbiRoomContext {
  // ── Core data ──
  companion: BlobbiCompanion;
  companions: BlobbiCompanion[];
  selectedD: string;
  profile: BlobbonautProfile | null;

  // ── House (kind 11127) ──
  /** The parsed house content, or null while loading. */
  house: BlobbiHouseContent | null;
  /** The raw house event — needed by write hooks (useRoomSceneEditor). */
  houseEvent: NostrEvent | null;
  updateHouseEvent: (event: NostrEvent) => void;
  /** Room order derived from the house layout. */
  roomOrder: BlobbiRoomId[];

  // ── Projected / visual state ──
  currentStats: {
    hunger: number;
    happiness: number;
    health: number;
    hygiene: number;
    energy: number;
  };
  isSleeping: boolean;
  isEgg: boolean;
  isBaby: boolean;

  // ── Visual recipe ──
  statusRecipe: BlobbiVisualRecipe | undefined;
  statusRecipeLabel: string | undefined;
  effectiveEmotion: BlobbiEmotion;
  hasDevOverride: boolean;
  blobbiReaction: BlobbiReactionState;

  // ── Item use ──
  onUseItem: (itemId: string, action: InventoryAction) => Promise<void>;
  handleUseItemFromTab: (itemId: string) => void;
  isUsingItem: boolean;
  usingItemId: string | null;
  allShopItems: ShopItem[];

  // ── Direct actions ──
  onDirectAction: (action: DirectAction) => Promise<void>;
  handleDirectAction: (action: DirectAction) => void;
  isDirectActionPending: boolean;

  // ── Inline activity (music/sing) ──
  inlineActivity: InlineActivityState;
  setInlineActivity: React.Dispatch<React.SetStateAction<InlineActivityState>>;
  setBlobbiReaction: React.Dispatch<React.SetStateAction<BlobbiReactionState>>;
  setActionOverrideEmotion: React.Dispatch<React.SetStateAction<BlobbiEmotion | null>>;
  showTrackPickerModal: boolean;
  setShowTrackPickerModal: React.Dispatch<React.SetStateAction<boolean>>;
  handleTrackSelected: (selection: SelectedTrack) => Promise<void>;
  handleConfirmSing: () => Promise<void>;
  handleCloseInlineActivity: () => void;
  handleMusicPlaybackStart: () => void;
  handleMusicPlaybackStop: () => void;
  handleSingRecordingStart: () => void;
  handleSingRecordingStop: () => void;
  handleChangeTrack: () => void;

  // ── Rest / sleep ──
  onRest: () => void;
  actionInProgress: string | null;
  isPublishing: boolean;

  // ── Companion toggle ──
  isCurrentCompanion: boolean;
  canBeCompanion: boolean;
  isUpdatingCompanion: boolean;
  isActiveFloatingCompanion: boolean;
  handleSetAsCompanion: () => Promise<void>;

  // ── Photo ──
  showPhotoModal: boolean;
  setShowPhotoModal: React.Dispatch<React.SetStateAction<boolean>>;

  // ── Blobbi selector ──
  onSelectBlobbi: (d: string) => void;

  // ── Incubation / Evolution / Tasks ──
  isIncubating: boolean;
  isEvolvingState: boolean;
  canStartIncubation: boolean;
  canStartEvolution: boolean;
  isStartingIncubation: boolean;
  isStartingEvolution: boolean;
  isStoppingIncubation: boolean;
  isStoppingEvolution: boolean;
  isHatching: boolean;
  isEvolving: boolean;
  hatchTasks: ReturnType<typeof useHatchTasks>;
  evolveTasks: ReturnType<typeof useEvolveTasks>;
  onStartIncubation: (mode: StartIncubationMode, stopOtherD?: string) => Promise<void>;
  onStartEvolution: () => Promise<void>;
  onStopIncubation: () => Promise<void>;
  onStopEvolution: () => Promise<void>;
  onHatch: () => Promise<void>;
  onEvolve: () => Promise<void>;
  showPostModal: boolean;
  setShowPostModal: React.Dispatch<React.SetStateAction<boolean>>;
  refetchCurrentTasks: () => void;

  // ── Daily missions ──
  dailyMissions: ReturnType<typeof useDailyMissions>;
  onClaimReward: (id: string) => void;
  isClaimingReward: boolean;
  availableStages: ('egg' | 'baby' | 'adult')[];

  // ── Adoption ──
  showAdoptionFlow: boolean;
  setShowAdoptionFlow: React.Dispatch<React.SetStateAction<boolean>>;

  // ── Adoption + Profile update props ──
  publishEvent: (params: { kind: number; content: string; tags: string[][] }) => Promise<NostrEvent>;
  updateProfileEvent: (event: NostrEvent) => void;
  updateCompanionEvent: (event: NostrEvent) => void;
  invalidateProfile: () => void;
  invalidateCompanion: () => void;
  setStoredSelectedD: (d: string) => void;
  ensureCanonicalBeforeAction: () => Promise<{
    companion: BlobbiCompanion;
    content: string;
    allTags: string[][];
    wasMigrated: boolean;
    profileAllTags: string[][];
    profileStorage: StorageItem[];
  } | null>;

  // ── Naddr link ──
  blobbiNaddr: string;

  // ── Hero measurement ──
  /** Callback ref for the hero container — re-attaches ResizeObserver on room switch */
  heroRef: React.RefCallback<HTMLDivElement> | React.RefObject<HTMLDivElement | null>;
  heroWidth: number;

  // ── DEV ONLY ──
  showDevEditor: boolean;
  setShowDevEditor: (show: boolean) => void;
  onDevEditorApply: (updates: import('@/blobbi/dev').BlobbiDevUpdates) => Promise<void>;
  isDevUpdating: boolean;
  showEmotionPanel: boolean;
  setShowEmotionPanel: React.Dispatch<React.SetStateAction<boolean>>;
  showProgressionPanel: boolean;
  setShowProgressionPanel: React.Dispatch<React.SetStateAction<boolean>>;
  showHatchCeremony: boolean;
  setShowHatchCeremony: React.Dispatch<React.SetStateAction<boolean>>;

  // ── Inventory modal (still used in kitchen) ──
  inventoryAction: InventoryAction | null;
  setInventoryAction: React.Dispatch<React.SetStateAction<InventoryAction | null>>;

  // ── Last feed timestamp (for poop system) ──
  lastFeedTimestamp: number | undefined;
}

// ─── Poop State (passed from shell to rooms) ──────────────────────────────────

import type { PoopInstance } from './poop-system';

export interface RoomPoopState {
  /** All poop instances across rooms */
  poops: PoopInstance[];
  /** Whether shovel mode is currently active */
  shovelMode: boolean;
  /** Toggle shovel mode on/off */
  setShovelMode: React.Dispatch<React.SetStateAction<boolean>>;
  /** Remove a poop (returns XP reward via callback) */
  onRemovePoop: (poopId: string) => void;
}
