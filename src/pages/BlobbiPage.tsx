import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { defineMessages, FormattedMessage, useIntl } from 'react-intl';
import { useSeoMeta } from '@/hooks/useSeoMeta';
import { nip19 } from 'nostr-tools';
import { Egg, Moon, Sun, RefreshCw, Check, Plus, Camera, Footprints, Wrench, Theater, ExternalLink, Utensils, Gamepad2, Sparkles, Pill, Music, Mic, Loader2, Target, Droplets, Heart, Zap, Refrigerator, ShowerHead, Candy, TowelRack, X, Activity, Users } from 'lucide-react';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import { useProjectedBlobbiState } from '@blobbi-kit/react/hooks/useProjectedBlobbiState';
import { useBlobbiInteractions } from '@blobbi-kit/react/hooks/useBlobbiInteractions';
import { useBlobbiActivityHistory } from '@blobbi-kit/react/hooks/useBlobbiActivityHistory';
import { useCanonicalSync } from '@blobbi-kit/react/hooks/useCanonicalSync';
import { getShopItemById } from '@/blobbi/shop/lib/blobbi-shop-items';
import { timeAgo } from '@/lib/timeAgo';
import { useAppContext } from '@/hooks/useAppContext';
import { useBlobbonautProfile } from '@/hooks/useBlobbonautProfile';
import { useBlobbonautProfileNormalization } from '@/hooks/useBlobbonautProfileNormalization';
import { useBlobbisCollection } from '@blobbi-kit/react/hooks/useBlobbisCollection';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useNostr } from '@nostrify/react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useFreshBlobbiBeforeAction } from '@blobbi-kit/react/hooks/useFreshBlobbiBeforeAction';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
import { toast } from '@/hooks/useToast';

import { LoginArea } from '@/components/auth/LoginArea';
import { Button } from '@/components/ui/button';

import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { BlobbiStageVisual } from '@/blobbi/ui/BlobbiStageVisual';
import { BlobbiHatchingCeremony } from '@/blobbi/onboarding/components/BlobbiHatchingCeremony';
import { decideFirstHatch } from '@/blobbi/onboarding/lib/first-hatch-decision';
import { useRecoveredBlobbis } from '@/blobbi/onboarding/hooks/useRecoveredBlobbis';
import { BlobbiEvolveCeremony } from '@/blobbi/onboarding/components/BlobbiEvolveCeremony';
import { BlobbiPhotoModal } from '@/blobbi/ui/BlobbiPhotoModal';

import { useBlobbiCompanionData } from '@/blobbi/companion/hooks/useBlobbiCompanionData';
import { useLayoutOptions } from '@/contexts/LayoutContext';

import { openUrl } from '@/lib/downloadFile';
import { cn } from '@/lib/utils';
import { getProfileUrl } from '@/lib/profileUrl';

import {
  KIND_BLOBBI_STATE,
  KIND_BLOBBONAUT_PROFILE,
  updateBlobbiTags,
  updateBlobbonautTags,
  statsToTagUpdates,
  getSelectedBlobbiKey,
  type BlobbiCompanion,
  type BlobbiStats,
  type BlobbonautProfile,
} from '@blobbi-kit/core/blobbi';

import { applyBlobbiDecay } from '@blobbi-kit/core/blobbi-decay';
import { getBlobbiStatDisplayState } from '@blobbi-kit/core/blobbi-segments';

import { getLiveShopItems } from '@/blobbi/shop/lib/blobbi-shop-items';

import {
  PlayMusicModal,
  InlineMusicPlayer,
  InlineSingCard,
  useBlobbiUseInventoryItem,
  useBlobbiEvolve,
  useBlobbiDirectAction,
  useStartIncubation,
  useStopIncubation,
  useStartEvolution,
  useStopEvolution,
  useHatchTasks,
  useEvolveTasks,
  createMusicActivity,
  createSingActivity,
  createNoActivity,
  getActionForItem,
  trackDailyMissionProgress,
  getStreakTagUpdates,
   previewStatChangesWithSegments,
   useDailyMissions,
   useAwardDailyXp,
   usePersistEvolutionProgress,
   usePersistDailyProgress,
   applyXPGain,
   POOP_CLEANUP_XP,
   type InventoryAction,
  type DirectAction,
  type InlineActivityState,
  type SelectedTrack,
  type BlobbiReactionState,
  type StartIncubationMode,
} from '@/blobbi/actions';
import { BlobbiOnboardingFlow } from '@/blobbi/onboarding';
import { useBlobbiActionsRegistration, type UseItemFunction } from '@/blobbi/companion/interaction';
import { getAllNeeds } from '@/blobbi/companion/interaction/needDetection';
import { BlobbiDevEditor, useBlobbiDevUpdate, type BlobbiDevUpdates, BlobbiEmotionPanel, useEffectiveEmotion, isLocalhostDev } from '@/blobbi/dev';
import { useStatusReaction } from '@/blobbi/ui/hooks/useStatusReaction';
import { buildSleepingRecipe } from '@/blobbi/ui/lib/recipe';
import { playMunchSound } from '@/blobbi/ui/lib/munchSound';
import { BlobbiRoomShell, type RoomControl, type RoomEditorBinding, type RoomFloorThing, type RoomGuest } from '@/blobbi/rooms/components/BlobbiRoomShell';
import { BlobbiRoomHero } from '@/blobbi/rooms/components/BlobbiRoomHero';
import { BlobbiGuestStage, BlobbiRoomStage } from '@/blobbi/rooms/components/BlobbiRoomStage';
import { BlobbiRoomStatusHud } from '@/blobbi/rooms/components/BlobbiRoomStatusHud';
import { ItemCarousel, type CarouselEntry } from '@/blobbi/rooms/components/ItemCarousel';
import { RoomActionButton } from '@/blobbi/rooms/components/RoomActionButton';
import { ShovelButton, ShovelGhost } from '@/blobbi/rooms/components/RoomPoopLayer';
import { type BlobbiRoomId, ROOM_META, isValidRoomId, DEFAULT_INITIAL_ROOM, DEFAULT_ROOM_ORDER } from '@/blobbi/rooms/lib/room-config';
import { OVERFEED_THRESHOLD, OVERFEED_CHANCE, addPoop, generateInitialPoops, markPoopUnder, poopAt, type PoopInstance } from '@/blobbi/rooms/lib/poop-system';
import { ROOM_ACTION_SLOT, ROOM_BOTTOM_BAR_CLASS, ROOM_UI_SCALE } from '@/blobbi/rooms/lib/room-layout';
import { type RoomLayout, type RoomLayoutsContent, parseRoomLayoutsContent } from '@/blobbi/rooms/lib/room-layout-schema';
import { getEffectiveRoomLayout } from '@/blobbi/rooms/lib/room-layout-effective';
import { parseRoomFurnitureContent, rebaseRoomDraft, roomFurnitureUpdate, RoomFurnitureTooNewError, type FurniturePlacement } from '@/blobbi/rooms/lib/room-furniture-schema';
import { getEffectiveRoomFurniture } from '@/blobbi/rooms/lib/room-furniture-effective';
import { RoomDecoratorOverlay, RoomDecoratorToolbar } from '@/blobbi/rooms/components/RoomDecorator';
import { MAIN_BLOBBI } from '@/blobbi/rooms/lib/room-geometry';
import type { FurnitureInteraction } from '@/blobbi/rooms/lib/furniture-registry';
import { SNO_FURNITURE_PREFIX } from '@/blobbi/rooms/lib/sno-furniture';
import { SubHeaderBar } from '@/components/SubHeaderBar';
import { TabButton } from '@/components/TabButton';
import { RoomDrawer } from '@/blobbi/rooms/components/RoomDrawer';
import { serializeProfileContent } from '@blobbi-kit/core/missions';
import { fetchFreshBlobbonautProfile } from '@blobbi-kit/core/fetchFreshBlobbonautProfile';
import { buildGuideTarget, getGuideRoomDirection, type GuideTarget } from '@/blobbi/rooms/lib/stat-guide-config';
import { getActionEmotion, SEVERITY_THRESHOLDS } from '@/blobbi/ui/lib/status-reactions';
import { useInteractionReaction, INVENTORY_TO_REACTION } from '@/blobbi/ui/hooks/useInteractionReaction';
import { useRoomDrag, type RoomDrag } from '@/blobbi/rooms/hooks/useRoomDrag';
import { RoomGuestPicker } from '@/blobbi/rooms/components/RoomGuestPicker';
import type { BlobbiEmotion } from '@/blobbi/ui/lib/emotions';

type RoomDragState = NonNullable<RoomDrag['drag']>;



/**
 * Enable debug logging in development only */
const DEBUG_BLOBBI = import.meta.env.DEV;

/**
 * Stable care-item effect resolver backed by the shop catalog. Defined at module
 * scope so it keeps a stable identity across renders (avoids recreating the
 * useCanonicalSync callback/effect deps every render).
 */
const resolveBlobbiCareItemEffect = (itemId: string) => getShopItemById(itemId)?.effect;

/** Stable empty list, so an egg's room doesn't see a new one each render. */
const NO_POOPS: PoopInstance[] = [];

/** Stat keys checked for the companion selector care badge (excludes energy). */
const CARE_BADGE_STATS = ['hunger', 'happiness', 'hygiene', 'health'] as const;

/**
 * Check if a companion needs care using the segment display model.
 *
 * Shows a care badge when:
 * - any stat is `urgent`, OR
 * - two or more stats are `attention`.
 *
 * Eggs always return `protected` from the helper, so they never show a badge.
 */
function companionNeedsCare(companion: BlobbiCompanion): boolean {
  let attentionCount = 0;
  for (const stat of CARE_BADGE_STATS) {
    const value = companion.stats[stat] ?? 100;
    const { careState } = getBlobbiStatDisplayState({ stage: companion.stage, stat, value });
    if (careState === 'urgent') return true;
    if (careState === 'attention') attentionCount++;
  }
  return attentionCount >= 2;
}



// ─── Page Component ───────────────────────────────────────────────────────────

export function BlobbiPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();

  useSeoMeta({
    title: `Blobbi | ${config.appName}`,
    description: 'Care for your virtual pet companion on Nostr',
  });

  if (!user) {
    return <LoggedOutState />;
  }

  return <BlobbiContent />;
}

// ─── Logged Out State ─────────────────────────────────────────────────────────

function LoggedOutState() {
  useLayoutOptions({ hasSubHeader: true, noOverscroll: true });

  return (
    <main className="flex flex-col items-center justify-center p-6 gap-6 min-h-[60vh]">
      <div className="flex flex-col items-center gap-3 text-center max-w-sm">
        <div className="size-20 rounded-3xl bg-primary/10 flex items-center justify-center">
          <Egg className="size-10 text-primary" />
        </div>
        <h1 className="text-2xl font-bold">Blobbi</h1>
        <p className="text-muted-foreground">
          Log in with your Nostr account to care for your virtual pet companion.
        </p>
        <LoginArea className="mt-2" />
      </div>
    </main>
  );
}

// ─── Main Content ─────────────────────────────────────────────────────────────

function BlobbiContent() {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { mutateAsync: publishEvent, isPending: isPublishing } = useNostrPublish();
  const { fetchFreshBlobbiBeforeAction } = useFreshBlobbiBeforeAction(user?.pubkey);
  
  const {
    profile,
    isLoading: profileLoading,
    invalidate: invalidateProfile,
    updateProfileEvent,
  } = useBlobbonautProfile();
  
  // Auto-normalize profiles missing pettingLevel tag
  useBlobbonautProfileNormalization({
    profile,
    updateProfileEvent,
    invalidateProfile,
  });
  
  // STEP 1: Fetch ALL the user's Blobbi events from relays (author is source of truth).
  // No dList needed — useBlobbisCollection() without args queries by author + ecosystem tag.
  // This ensures blobbis are never invisible due to a stale profile.has[] list.
  const {
    companions: strictCompanions,
    isLoading: collectionLoading,
    isFetching: collectionFetching,
    invalidate: invalidateCollection,
    updateCompanionEvent,
  } = useBlobbisCollection(undefined, user?.pubkey);

  // INTEROP RECOVERY: the strict collection drops externally-created Blobbis
  // (e.g. Blobbi Island) that trip blobbi-kit's `client`/`t == "blobbi"` legacy
  // heuristic, even though they are well-formed and owned — the user would
  // otherwise see "Pet Data Not Found". When the strict collection has loaded
  // and is empty, recover displayable interop Blobbis so they can be shown and
  // selected. This never resurrects genuine old-app events (see
  // `isDisplayableInteropBlobbi`) and adds no round-trip on the common path.
  const recoveryEnabled = !collectionLoading && !collectionFetching && strictCompanions.length === 0;
  const {
    companions: recoveredCompanions,
    isFetching: recoveryFetching,
  } = useRecoveredBlobbis(user?.pubkey, recoveryEnabled);

  // Effective collection: strict results when present, otherwise recovered ones.
  const companions = useMemo(
    () => (strictCompanions.length > 0 ? strictCompanions : recoveredCompanions),
    [strictCompanions, recoveredCompanions],
  );

  // STEP 2: Companions list (deduplicated by d-tag, newest wins, inside
  // useBlobbisCollection). The collection is already legacy-free — old-format
  // events are dropped at the parse layer — so no migration/dedup is applied here.
  const filteredCompanions = companions;

  const filteredCompanionsByD = useMemo(() => {
    const record: Record<string, BlobbiCompanion> = {};
    for (const c of filteredCompanions) {
      record[c.d] = c;
    }
    return record;
  }, [filteredCompanions]);

  // STEP 3: localStorage for UI selection (user-scoped key)
  const localStorageKey = user?.pubkey ? getSelectedBlobbiKey(user.pubkey) : 'blobbi:selected:d:none';
  const [storedSelectedD, setStoredSelectedD] = useLocalStorage<string | null>(localStorageKey, null);
  
  // State for showing the adoption flow (for "Adopt another Blobbi")
  const [showAdoptionFlow, setShowAdoptionFlow] = useState(false);
  
  // STEP 4: Selection Priority
  // 1) localStorage selection (if valid and exists in collection) - USER SELECTION ALWAYS WINS
  // 2) first companion in the collection (deterministically ordered by d-tag in
  //    useBlobbisCollection, so this is stable across refreshes and care actions)
  // 3) undefined (show selector)
  //
  // CRITICAL: Default selection must NEVER overwrite localStorage.
  // User selection persists only via handleSelectBlobbi, not via this computed value.
  //
  // NOTE: We no longer consult the profile `has` list for ordering. Ownership
  // is derived from the authored kind 31124 events (the collection), which is
  // the single source of truth; `has` was a redundant mirror that could drift
  // and surface a stale/egg selection.
  const selectedD = useMemo(() => {
    // Priority 1: localStorage selection (if it exists in filtered collection)
    // USER SELECTION ALWAYS WINS - this is the authoritative source
    if (storedSelectedD && filteredCompanionsByD[storedSelectedD]) {
      if (DEBUG_BLOBBI) {
        console.log('[BlobbiPage] selectedD: using localStorage selection:', storedSelectedD);
      }
      return storedSelectedD;
    }

    // Priority 2: First companion in the deterministically-ordered collection
    if (filteredCompanions.length > 0) {
      const firstD = filteredCompanions[0].d;
      if (DEBUG_BLOBBI) {
        console.log('[BlobbiPage] selectedD: using first companion from collection:', firstD);
      }
      return firstD;
    }

    // Priority 3: No valid selection
    if (DEBUG_BLOBBI) {
      console.log('[BlobbiPage] selectedD: no valid selection available');
    }
    return undefined;
  }, [storedSelectedD, filteredCompanionsByD, filteredCompanions]);
  
  // NOTE: We intentionally do NOT auto-save the computed selectedD to localStorage.
  // This prevents the default selection from overwriting user selections during:
  // - WebSocket updates
  // - Query refetches  
  // - Race conditions where storedSelectedD is not yet in filteredCompanionsByD
  //
  // User selections are only persisted via handleSelectBlobbi (line ~232).
  
  // Get the selected companion from the filtered collection
  const companion = selectedD ? filteredCompanionsByD[selectedD] ?? null : null;
  
  // Debug log to confirm which Blobbi is rendered (dev only)
  useEffect(() => {
    if (DEBUG_BLOBBI && companion) {
      console.log('[Blobbi UI]', {
        selectedD,
        name: companion.name,
        stage: companion.stage,
        state: companion.state,
      });
    }
  }, [selectedD, companion]);
  
  // Combine loading/fetching states
  const companionFetching = collectionFetching;
  const invalidateCompanion = invalidateCollection;
  
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  
  // Handler for selecting a Blobbi from the selector
  // This is the ONLY place where user selection is persisted to localStorage
  const handleSelectBlobbi = useCallback((d: string) => {
    if (DEBUG_BLOBBI) {
      console.log('[BlobbiPage] handleSelectBlobbi: user selected:', d, '(previous storedSelectedD was:', storedSelectedD, ')');
    }
    setStoredSelectedD(d);
  }, [setStoredSelectedD, storedSelectedD]);
  
  // ─── Helper: Fetch Fresh Before Action ───
  // Read step of the read-modify-write pattern: fetch the freshest companion +
  // profile from relays before any mutation so we never overwrite newer state.
  const ensureCanonicalBeforeAction = useCallback(async () => {
    if (!companion || !profile) return null;
    
    return fetchFreshBlobbiBeforeAction({
      companion,
      profile,
      updateProfileEvent,
      updateCompanionEvent,
    });
  }, [companion, profile, fetchFreshBlobbiBeforeAction, updateProfileEvent, updateCompanionEvent]);
  
  // ─── Rest Action ───
  // Operates on the page-selected `companion` (not profile.currentCompanion).
  // The companion floating button has its own independent sleep toggle.
  const handleRest = useCallback(async () => {
    if (!user?.pubkey || !companion) return;

    const isCurrentlySleeping = companion.state === 'sleeping';
    const newState = isCurrentlySleeping ? 'active' : 'sleeping';

    setActionInProgress('rest');
    try {
      // Fetch fresh companion + profile before acting (read-modify-write)
      const canonical = await ensureCanonicalBeforeAction();
      if (!canonical) {
        setActionInProgress(null);
        return;
      }

      // Apply accumulated decay before the state change
      const now = Math.floor(Date.now() / 1000);
      const decayResult = applyBlobbiDecay({
        stage: canonical.companion.stage,
        state: canonical.companion.state,
        stats: canonical.companion.stats,
        lastDecayAt: canonical.companion.lastDecayAt,
        now,
      });

      // Build the new tags with decayed stats + new state
      // Get streak updates (putting to sleep/waking counts as care activity)
      const streakUpdates = getStreakTagUpdates(canonical.companion) ?? {};

      const newTags = updateBlobbiTags(canonical.allTags, {
        state: newState,
        ...statsToTagUpdates(decayResult.stats, now),
        ...streakUpdates,
      });

      const prev = canonical.companion.event;
      const event = await publishEvent({
        kind: KIND_BLOBBI_STATE,
        content: canonical.content,
        tags: newTags,
        prev,
      });

      updateCompanionEvent(event);

      toast({
        title: isCurrentlySleeping ? 'Woke up!' : 'Resting...',
        description: isCurrentlySleeping
          ? 'Your Blobbi is now awake and active!'
          : 'Your Blobbi is taking a rest.',
      });

      // Track daily mission progress for sleep action (only when putting to sleep)
      if (!isCurrentlySleeping) {
        trackDailyMissionProgress('sleep', 1, user?.pubkey);
      }
    } catch (error) {
      console.error('Failed to update state:', error);
      toast({
        title: 'Failed to update',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setActionInProgress(null);
    }
  }, [user?.pubkey, companion, ensureCanonicalBeforeAction, publishEvent, updateCompanionEvent]);
  
  // ─── Use Inventory Item Hook ───
  const { mutateAsync: executeUseItem, isPending: isUsingItem } = useBlobbiUseInventoryItem({
    companion,
    profile,
    ensureCanonicalBeforeAction,
    updateCompanionEvent,
    updateProfileEvent,
  });
  
  // Handler for using an item (always uses once)
  const handleUseItem = useCallback(async (itemId: string, action: InventoryAction) => {
    await executeUseItem({ itemId, action });
  }, [executeUseItem]);
  
  // ─── Blobbi Actions Registration ───
  // Register item use functionality with the global context so BlobbiCompanionLayer can use it
  const useItemForContext = useMemo<UseItemFunction | null>(() => {
    // Only provide the function when companion and profile are available
    if (!companion || !profile) return null;
    
    return async (itemId, action) => {
      try {
        const result = await executeUseItem({ itemId, action });
        return { 
          success: true, 
          statsChanged: result?.statsChanged,
        };
      } catch (error) {
        return { 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    };
  }, [executeUseItem, companion, profile]);
  
  // Register with the global BlobbiActionsContext
  useBlobbiActionsRegistration(useItemForContext, isUsingItem);
  
  // ─── Stage Transition Hooks ───
  // Hatching is published inline by BlobbiHatchingCeremony.executeHatch; there
  // is no live hatch mutation on this page, so the spinner source is constant.
  const isHatching = false;
  
  const { mutateAsync: executeEvolve, isPending: isEvolving } = useBlobbiEvolve({
    companion,
    profile,
    ensureCanonicalBeforeAction,
    updateCompanionEvent,
  });
  
  // Handler for evolution (baby -> adult)
  const handleEvolve = useCallback(async () => {
    await executeEvolve();
  }, [executeEvolve]);
  
  // ─── Direct Action Hook ───
  const { mutateAsync: executeDirectAction, isPending: isDirectActionPending } = useBlobbiDirectAction({
    companion,
    ensureCanonicalBeforeAction,
    updateCompanionEvent,
  });
  
  // Handler for direct actions (play_music, sing)
  const handleDirectAction = useCallback(async (action: DirectAction) => {
    await executeDirectAction({ action });
  }, [executeDirectAction]);
  
  // ─── DEV ONLY: State Editor Hook ───
  const { mutateAsync: executeDevUpdate, isPending: isDevUpdating } = useBlobbiDevUpdate({
    companion,
    updateCompanionEvent,
  });
  
  // State for dev editor modal
  const [showDevEditor, setShowDevEditor] = useState(false);
  
  // Handler for dev editor apply
  const handleDevEditorApply = useCallback(async (updates: BlobbiDevUpdates) => {
    await executeDevUpdate(updates);
  }, [executeDevUpdate]);
  
  // ─── Determine UI State ───
  // Clear separation of cases based on profile and pet data
  
  // Derive page state for debugging
  const pageState = useMemo(() => {
    if (profileLoading) return 'loading-profile';
    if (!profile) return 'no-profile';
    if (collectionLoading) return 'loading-companions';
    if (collectionFetching && companions.length === 0) return 'fetching-companions';
    if (companions.length === 0) return 'no-pets';
    if (!selectedD) return 'no-selection';
    if (!companion) return 'companion-not-resolved';
    return 'dashboard';
  }, [profileLoading, profile, collectionLoading, collectionFetching, companions.length, selectedD, companion]);

  // Only the room has its own dock and tab bar in place of the bottom nav
  useLayoutOptions({ hasSubHeader: true, noOverscroll: true, hideBottomNav: pageState === 'dashboard' });
  
  // Debug log page state decisions
  if (DEBUG_BLOBBI) {
    console.log('[BlobbiPage] State decision:', {
      pageState,
      profileLoading,
      hasProfile: !!profile,
      profileName: profile?.name,
      collectionLoading,
      collectionFetching,
      companionsLoaded: companions.length,
      selectedD,
      hasCompanion: !!companion,
    });
  }
  
  // ─── Hatching Ceremony State ───
  // The ceremony creates eggs in the background which updates profile data.
  // Without this flag, BlobbiPage would immediately fall through to the
  // dashboard the moment the egg appears in has[]. The flag keeps the
  // ceremony mounted until it calls onComplete.
  //
  // IMPORTANT: The ceremony decision is based on actual companion stages,
  // NOT the onboardingDone flag alone. This handles inconsistent accounts
  // where onboardingDone may be true despite the user never having hatched.
  //
  // Ceremony decision tree:
  // 1. No profile → ceremony (brand new user, creates profile + egg)
  // 2. Profile exists but no blobbis found on relays → ceremony (creates egg)
  // 3. Profile with blobbis → inspect companion stages, then:
  //    a. Any baby/adult exists → skip ceremony (dashboard)
  //    b. Only eggs exist → ceremony with existingCompanion (reuses egg)
  //    c. No companions resolved → ceremony (creates egg)
  const [ceremonyInProgress, setCeremonyInProgress] = useState(false);
  // Set to true once the companion-stage check has resolved so it doesn't
  // re-run on every render as companion data updates.
  const [ceremonyCheckDone, setCeremonyCheckDone] = useState(false);
  // Locks the egg chosen for the ceremony so a page refresh mid-animation
  // doesn't switch to a different egg or create a new one.
  const ceremonyEggRef = useRef<BlobbiCompanion | null>(null);

  // Whether we've finished loading enough data to make the decision.
  // The ceremony decision is ALWAYS gated on the kind 31124 collection (the
  // authoritative source of Blobbi ownership) — never on the profile alone.
  // Otherwise a missing/stale kind 11125 profile would trigger a duplicate
  // first hatch even when the user already owns a valid Blobbi (e.g. one
  // created directly by Blobbi Island). We also wait for the interop recovery
  // fetch to settle so a recoverable Island Blobbi is considered before we
  // decide the user has none.
  const strictReady = !collectionLoading && (!collectionFetching || strictCompanions.length > 0);
  const recoveryReady = !recoveryEnabled || !recoveryFetching || recoveredCompanions.length > 0;
  const companionDataReady = strictReady && recoveryReady;
  // We must inspect the actual companion collection before deciding whether to
  // run the ceremony. This fires for ALL users — with or without a profile,
  // regardless of onboardingDone — so an Island-created Blobbi (which may have
  // no matching Ditto profile yet) still suppresses the first-hatch flow.
  const pendingCeremonyCheck = !ceremonyCheckDone;

  // Resolve the ceremony decision once the companion collection has loaded.
  useEffect(() => {
    if (!pendingCeremonyCheck || !companionDataReady || ceremonyInProgress) return;
    
    // Mark check as done so this effect doesn't re-fire.
    setCeremonyCheckDone(true);
    
    // Ownership is derived purely from the parsed, validated 31124 collection.
    // An Island-created baby (stage=baby, empty content, no Ditto-specific
    // tags) is already a valid entry here and counts as an existing Blobbi.
    const decision = decideFirstHatch({
      companions,
      currentCompanionD: profile?.currentCompanion,
    });
    
    if (DEBUG_BLOBBI) {
      console.log('[BlobbiPage] First-hatch decision:', {
        pubkey: user?.pubkey,
        hasProfile: !!profile,
        currentCompanion: profile?.currentCompanion,
        onboardingDone: profile?.onboardingDone,
        collectionLoading,
        collectionFetching,
        companionsLength: companions.length,
        companions: companions.map(c => ({ d: c.d, stage: c.stage, name: c.name })),
        decision: decision.kind,
      });
    }
    
    if (decision.kind === 'has-blobbi') {
      // User already owns a hatched Blobbi — never create/hatch another.
      // Prefer the profile's current_companion selection when possible.
      if (DEBUG_BLOBBI) console.log('[BlobbiPage] Skipping ceremony: user has a Blobbi', decision.selected.d);
      if (profile?.currentCompanion) {
        setStoredSelectedD(decision.selected.d);
      }
      // Auto-fix the onboardingDone flag if a profile exists and it was missing.
      if (profile && !profile.onboardingDone && user?.pubkey) {
        fetchFreshEvent(nostr, {
          kinds: [KIND_BLOBBONAUT_PROFILE],
          authors: [user.pubkey],
        }).then(prev => {
          if (!prev) return;
          const updatedTags = updateBlobbonautTags(prev.tags, {
            blobbi_onboarding_done: 'true',
          });
          return publishEvent({
            kind: KIND_BLOBBONAUT_PROFILE,
            content: prev.content,
            tags: updatedTags,
            prev,
          });
        }).then(event => {
          if (event) {
            updateProfileEvent(event);
            invalidateProfile();
          }
        }).catch(err => console.error('[BlobbiPage] Failed to auto-fix onboardingDone:', err));
      }
    } else if (decision.kind === 'reuse-egg') {
      // User has only eggs — reuse one for the ceremony (don't create a new one).
      ceremonyEggRef.current = decision.egg;
      if (DEBUG_BLOBBI) console.log('[BlobbiPage] Starting ceremony with existing egg:', decision.egg.d);
      setCeremonyInProgress(true);
    } else {
      // No valid Blobbi found on relays — treat as new user and allow hatch.
      if (DEBUG_BLOBBI) console.log('[BlobbiPage] Starting ceremony: no existing Blobbi found');
      setCeremonyInProgress(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCeremonyCheck, companionDataReady, ceremonyInProgress]);
  
  // ─── CASE A: Profile still loading ───
  if (profileLoading && !ceremonyInProgress) {
    return <DashboardLoadingState />;
  }
  
  // ─── CASE A2: Waiting for companions to decide about ceremony ───
  if (pendingCeremonyCheck && !companionDataReady && !ceremonyInProgress) {
    if (DEBUG_BLOBBI) console.log('[BlobbiPage] Showing: loading (waiting for companions to decide ceremony)');
    return <DashboardLoadingState />;
  }
  
  // ─── CASE B/C: Hatching ceremony ───
  // Stays mounted until the ceremony explicitly completes, even if the
  // underlying data changes during the ceremony.
  // Portaled to document.body so it escapes the center column stacking context
  // (which has `relative z-0`) and covers the entire app shell including the
  // RightSidebar — matching the subsequent hatch ceremony portal at z-[100].
  if (ceremonyInProgress) {
    if (DEBUG_BLOBBI) console.log('[BlobbiPage] Showing: hatching ceremony');
    return createPortal(
      <div className="fixed inset-0 z-100 bg-background">
        <BlobbiOnboardingFlow
          profile={profile ?? null}
          updateProfileEvent={updateProfileEvent}
          updateCompanionEvent={updateCompanionEvent}
          invalidateProfile={invalidateProfile}
          invalidateCompanion={invalidateCompanion}
          setStoredSelectedD={setStoredSelectedD}
          existingCompanion={ceremonyEggRef.current}
          onExistingBlobbiFound={(companion) => {
            // Hard preflight guard found an existing Blobbi (e.g. Island-created)
            // right before a duplicate would have been minted. Select it and
            // leave the ceremony without creating anything.
            if (DEBUG_BLOBBI) console.log('[BlobbiPage] Preflight found existing Blobbi, aborting hatch:', companion.d);
            setStoredSelectedD(companion.d);
            invalidateCollection();
            setCeremonyInProgress(false);
          }}
          onComplete={() => setCeremonyInProgress(false)}
        />
      </div>,
      document.body,
    );
  }
  
  // After ceremony check, profile must exist
  if (!profile) {
    return <DashboardLoadingState />;
  }
  
  // ─── CASE D: Companions still loading ───
  if (collectionLoading) {
    if (DEBUG_BLOBBI) console.log('[BlobbiPage] Showing: loading companions');
    return <DashboardLoadingState />;
  }
  
  // ─── CASE E: Companions not yet resolved (fetching) ───
  // Also wait while the interop recovery fetch is still in flight, so we don't
  // flash "Pet Data Not Found" before a recoverable Island Blobbi arrives.
  if ((collectionFetching || (recoveryEnabled && recoveryFetching)) && companions.length === 0) {
    if (DEBUG_BLOBBI) console.log('[BlobbiPage] Showing: syncing pets from relays');
    return (
      <DashboardShell>
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
          <div className="flex flex-col items-center gap-4 text-center max-w-sm">
            <div className="size-24 rounded-3xl bg-muted/50 flex items-center justify-center">
              <RefreshCw className="size-12 text-muted-foreground animate-spin" />
            </div>
            <h1 className="text-2xl font-bold">Syncing your Blobbi...</h1>
            <p className="text-muted-foreground">
              Fetching your pet data from relays...
            </p>
          </div>
        </div>
      </DashboardShell>
    );
  }
  
  // ─── CASE F: No blobbi events found on relays ───
  // This shouldn't normally happen after the ceremony check, but handle gracefully
  if (companions.length === 0) {
    if (DEBUG_BLOBBI) console.log('[BlobbiPage] Showing: pets not found error');
    return (
      <DashboardShell>
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
          <div className="flex flex-col items-center gap-4 text-center max-w-sm">
            <div className="size-24 rounded-3xl bg-amber-500/10 flex items-center justify-center">
              <RefreshCw className="size-12 text-amber-500" />
            </div>
            <h1 className="text-2xl font-bold">Pet Data Not Found</h1>
            <p className="text-muted-foreground">
              No Blobbi data could be loaded from relays.
              This may be a sync issue - try refreshing the page.
            </p>
            <Button
              onClick={() => {
                invalidateProfile();
                invalidateCompanion();
              }}
              variant="outline"
            >
              <RefreshCw className="size-4 mr-2" />
              Retry
            </Button>
          </div>
        </div>
      </DashboardShell>
    );
  }
  
  // ─── CASE G/H: No valid selection or companion not resolved ───
  // Show selector to pick which pet to display
  if (!selectedD || !companion) {
    if (DEBUG_BLOBBI) console.log('[BlobbiPage] Showing: pet selector');
    return (
      <>
        <BlobbiSelectorPage
          companions={filteredCompanions}
          onSelect={handleSelectBlobbi}
          isLoading={companionFetching}
          onAdopt={() => setShowAdoptionFlow(true)}
          currentCompanion={profile?.currentCompanion}
        />
        
        {/* Adoption Flow Modal */}
        <Dialog open={showAdoptionFlow} onOpenChange={setShowAdoptionFlow}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-0">
            <BlobbiOnboardingFlow
              profile={profile}
              updateProfileEvent={updateProfileEvent}
              updateCompanionEvent={updateCompanionEvent}
              invalidateProfile={invalidateProfile}
              invalidateCompanion={invalidateCompanion}
              setStoredSelectedD={setStoredSelectedD}
              adoptionOnly={true}
              userInitiated={true}
              onComplete={() => setShowAdoptionFlow(false)}
            />
          </DialogContent>
        </Dialog>
      </>
    );
  }
  
  // ─── CASE I: Everything ready - show dashboard ───
  // At this point: companion is BlobbiCompanion, selectedD is string (narrowed by Case H guard)
  // Note: Item use registration is handled by useBlobbiActionsRegistration hook above
  if (DEBUG_BLOBBI) console.log('[BlobbiPage] Showing: dashboard');
  return (
    <BlobbiDashboard
      companion={companion}
      companions={filteredCompanions}
      selectedD={selectedD}
      onSelectBlobbi={handleSelectBlobbi}
      onRest={handleRest}
      onUseItem={handleUseItem}
      onDirectAction={handleDirectAction}
      isUsingItem={isUsingItem}
      isDirectActionPending={isDirectActionPending}
      actionInProgress={actionInProgress}
      isPublishing={isPublishing}
      profile={profile}
      onEvolve={handleEvolve}
      isHatching={isHatching}
      isEvolving={isEvolving}
      publishEvent={publishEvent}
      updateProfileEvent={updateProfileEvent}
      updateCompanionEvent={updateCompanionEvent}
      invalidateProfile={invalidateProfile}
      invalidateCompanion={invalidateCompanion}
      setStoredSelectedD={setStoredSelectedD}
      ensureCanonicalBeforeAction={ensureCanonicalBeforeAction}
      // DEV ONLY: State editor props
      showDevEditor={showDevEditor}
      setShowDevEditor={setShowDevEditor}
      onDevEditorApply={handleDevEditorApply}
      isDevUpdating={isDevUpdating}
    />
  );
}

// ─── Dashboard Shell ──────────────────────────────────────────────────────────

interface DashboardShellProps {
  children: React.ReactNode;
}

function DashboardShell({ children }: DashboardShellProps) {
  return (
    <main className={cn(
      'flex flex-col overflow-hidden bg-background',
      // Mobile: fixed to escape pb-overscroll on the parent
      'max-sidebar:fixed max-sidebar:inset-0 max-sidebar:top-mobile-bar max-sidebar:z-0',
      // Desktop: normal flow within the center column
      'sidebar:h-dvh',
    )}>
      <div className="mx-auto w-full flex-1 min-h-0 flex flex-col">
        {children}
      </div>
    </main>
  );
}

// ─── Dashboard Drawer Type ────────────────────────────────────────────────────

/** Which drawer is open; 'none' = room view visible */
type DashboardDrawer = 'none' | 'missions' | 'activity' | 'more';

// ─── Main Blobbi Dashboard ────────────────────────────────────────────────────

interface BlobbiDashboardProps {
  companion: BlobbiCompanion;
  companions: BlobbiCompanion[];
  selectedD: string;
  onSelectBlobbi: (d: string) => void;
  onRest: () => void;
  onUseItem: (itemId: string, action: InventoryAction) => Promise<void>;
  onDirectAction: (action: DirectAction) => Promise<void>;
  isUsingItem: boolean;
  isDirectActionPending: boolean;
  actionInProgress: string | null;
  isPublishing: boolean;
  profile: BlobbonautProfile | null;
  // Stage transition handlers
  onEvolve: () => Promise<void>;
  isHatching: boolean;
  isEvolving: boolean;
  // Adoption flow props
  publishEvent: (params: { kind: number; content: string; tags: string[][]; prev?: import('@nostrify/nostrify').NostrEvent }) => Promise<import('@nostrify/nostrify').NostrEvent>;
  updateProfileEvent: (event: import('@nostrify/nostrify').NostrEvent) => void;
  updateCompanionEvent: (event: import('@nostrify/nostrify').NostrEvent) => void;
  invalidateProfile: () => void;
  invalidateCompanion: () => void;
  setStoredSelectedD: (d: string) => void;
  // Incubation helpers
  ensureCanonicalBeforeAction: () => Promise<{
    companion: BlobbiCompanion;
    content: string;
    allTags: string[][];
    profileAllTags: string[][];
    profileEvent: import('@nostrify/nostrify').NostrEvent;
  } | null>;
  // DEV ONLY: State editor props
  showDevEditor: boolean;
  setShowDevEditor: (show: boolean) => void;
  onDevEditorApply: (updates: BlobbiDevUpdates) => Promise<void>;
  isDevUpdating: boolean;
}

function BlobbiDashboard({
  companion,
  companions,
  selectedD,
  onSelectBlobbi,
  onRest,
  onUseItem,
  onDirectAction,
  isUsingItem,
  isDirectActionPending,
  actionInProgress,
  isPublishing,
  profile,
  onEvolve,
  isHatching,
  isEvolving,
  publishEvent,
  updateProfileEvent,
  updateCompanionEvent,
  invalidateProfile,
  invalidateCompanion,
  setStoredSelectedD,
  ensureCanonicalBeforeAction,
  // DEV ONLY
  showDevEditor,
  setShowDevEditor,
  onDevEditorApply,
  isDevUpdating,
}: BlobbiDashboardProps) {
  // Layout options (hasSubHeader, noOverscroll) set at BlobbiPage level
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const intl = useIntl();
  
  const isSleeping = companion.state === 'sleeping';
  const isEgg = companion.stage === 'egg';
  
  // ─── Active Drawer ───
  const [activeDrawer, setActiveDrawer] = useState<DashboardDrawer>('none');

  // ─── Room Navigation ───
  // Persisted room: only written on user-driven room changes (sleep override is UI-only).
  const roomStorageKey = `blobbi:room:${user?.pubkey ?? 'anon'}:${companion.d}`;
  const roomDefault = isValidRoomId(profile?.room) ? profile.room : DEFAULT_INITIAL_ROOM;
  const [storedRoom, setStoredRoom] = useLocalStorage<BlobbiRoomId>(roomStorageKey, roomDefault);
  const userRoom: BlobbiRoomId = isValidRoomId(storedRoom) ? storedRoom : DEFAULT_INITIAL_ROOM;
  /** The room being decorated, pinned so that falling asleep meanwhile doesn't move the view out from under the draft. */
  const [decorRoom, setDecorRoom] = useState<BlobbiRoomId | null>(null);
  // Effective room: sleeping temporarily forces 'rest'; waking up returns to storedRoom.
  const currentRoom: BlobbiRoomId = decorRoom ?? (isSleeping ? 'rest' : userRoom);

    // ─── Interaction Activity ───
  // Disabled for eggs: they do not participate in social stat-loss/care flow.
  const { interactions, isLoading: interactionsLoading } = useBlobbiInteractions(isEgg ? null : companion);

  // Interaction reaction layer — temporary visual rewards for care actions.
  // Produces emotion overrides, body animations, and particle overlays.
  // Placed before useCanonicalSync so the trigger can be passed directly.
  const { state: interactionReaction, trigger: triggerInteractionReaction } = useInteractionReaction();

  // ─── Automatic Canonical Sync ───
  // On mount (or companion switch), persist accumulated decay and consolidate
  // pending social interactions in a single publish. Replaces the old manual
  // "Apply pending care" button. Runs at most once per companion d-tag.
  const handleSocialConsolidated = useCallback(() => {
    triggerInteractionReaction('social_hearts');
  }, [triggerInteractionReaction]);

  useCanonicalSync({
    companion,
    interactions,
    interactionsLoading,
    updateCompanionEvent,
    ensureCanonicalBeforeAction,
    onSocialConsolidated: handleSocialConsolidated,
    publish: publishEvent,
    resolveCareItemEffect: resolveBlobbiCareItemEffect,
  });

  // ─── Social Permission Toggle ───
  const [isSocialToggling, setIsSocialToggling] = useState(false);

  const handleToggleSocial = useCallback(async (open: boolean) => {
    if (!companion) return;

    setIsSocialToggling(true);
    try {
      const canonical = await ensureCanonicalBeforeAction();
      if (!canonical) {
        setIsSocialToggling(false);
        return;
      }

      const newTags = updateBlobbiTags(canonical.allTags, {
        social: open ? 'open' : 'closed',
      });

      const prev = canonical.companion.event;
      const event = await publishEvent({
        kind: KIND_BLOBBI_STATE,
        content: canonical.content,
        tags: newTags,
        prev,
      });

      updateCompanionEvent(event);

      toast({
        title: open ? 'Social interactions enabled' : 'Social interactions disabled',
        description: open
          ? 'Other people can now care for this Blobbi.'
          : 'Only you can interact with this Blobbi.',
      });
    } catch (error) {
      console.error('Failed to toggle social permission:', error);
      toast({
        title: 'Failed to update',
        description: 'Could not change the social interaction setting. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSocialToggling(false);
    }
  }, [companion, ensureCanonicalBeforeAction, publishEvent, updateCompanionEvent]);

  // ─── Room Layout (read-only, decorative) ───
  const parsedRoomLayouts = useMemo(() => parseRoomLayoutsContent(profile?.content), [profile?.content]);
  const currentRoomLayout = useMemo(() => getEffectiveRoomLayout(currentRoom, parsedRoomLayouts), [currentRoom, parsedRoomLayouts]);

  // ─── Room Furniture (read-only, decorative) ───
  const parsedRoomFurniture = useMemo(() => parseRoomFurnitureContent(profile?.content), [profile?.content]);
  const currentFurniturePlacements = useMemo(() => getEffectiveRoomFurniture(currentRoom, parsedRoomFurniture), [currentRoom, parsedRoomFurniture]);

  // ─── Decorating (furniture + wallpaper/flooring, one draft, one save) ───
  const [isDecorating, setIsDecorating] = useState(false);
  const [furnitureDraft, setFurnitureDraft] = useState<FurniturePlacement[] | null>(null);
  const [layoutDraft, setLayoutDraft] = useState<RoomLayout | null>(null);
  const [furnitureSelectedIndex, setFurnitureSelectedIndex] = useState<number | null>(null);
  const [furnitureInvalid, setFurnitureInvalid] = useState<Set<number>>(() => new Set());
  const [isSavingRoom, setIsSavingRoom] = useState(false);
  const roomControlRef = useRef<RoomControl | null>(null);
  /** The room as decorating found it: what the save compares the drafts and rebases them against. */
  const decorBaseRef = useRef<{ furniture: FurniturePlacement[]; layout: RoomLayout } | null>(null);

  // 3D objects added from the feed, in any room, offered in the decorator's catalog
  const placedObjectIds = useMemo(() => {
    const ids = new Set<string>();
    for (const placements of Object.values(parsedRoomFurniture?.by_room ?? {})) {
      for (const p of placements ?? []) if (p.id.startsWith(SNO_FURNITURE_PREFIX)) ids.add(p.id);
    }
    return [...ids];
  }, [parsedRoomFurniture]);

  const handleOpenDecorator = useCallback(() => {
    setActiveDrawer('none');
    decorBaseRef.current = { furniture: currentFurniturePlacements, layout: currentRoomLayout };
    setDecorRoom(currentRoom);
    setFurnitureDraft([...currentFurniturePlacements]);
    setLayoutDraft(currentRoomLayout);
    setFurnitureSelectedIndex(null);
    setIsDecorating(true);
  }, [currentRoom, currentFurniturePlacements, currentRoomLayout]);

  const handleCloseDecorator = useCallback(() => {
    setIsDecorating(false);
    setDecorRoom(null);
    decorBaseRef.current = null;
    setFurnitureDraft(null);
    setLayoutDraft(null);
    setFurnitureSelectedIndex(null);
    setFurnitureInvalid(new Set());
  }, []);

  const handleSaveRoom = useCallback(async () => {
    const base = decorBaseRef.current;
    if (!user?.pubkey || !furnitureDraft || !layoutDraft || !base) return;
    // Only write what changed, so an untouched room keeps following the built-in defaults.
    // Compared with the room as decorating found it, not the cache, which may have refreshed since.
    const furnitureChanged = furnitureDraft.length !== base.furniture.length
      || furnitureDraft.some((item, i) => item !== base.furniture[i]);
    const layoutChanged = layoutDraft !== base.layout;
    if (!furnitureChanged && !layoutChanged) {
      handleCloseDecorator();
      return;
    }
    setIsSavingRoom(true);
    try {
      const freshProfile = await fetchFreshBlobbonautProfile(nostr, user.pubkey);
      if (!freshProfile) {
        toast({
          title: intl.formatMessage({ id: 'blobbiRoom.save.error', defaultMessage: 'Error' }),
          description: intl.formatMessage({ id: 'blobbiRoom.save.noProfile', defaultMessage: 'Could not fetch profile. Try again.' }),
        });
        return;
      }
      const prev = freshProfile.event;
      const updates: Record<string, unknown> = {};
      if (furnitureChanged) {
        // Keep what changed in the room since decorating started
        const latest = getEffectiveRoomFurniture(currentRoom, parseRoomFurnitureContent(prev.content));
        const placements = rebaseRoomDraft(base.furniture, furnitureDraft, latest);
        Object.assign(updates, roomFurnitureUpdate(prev.content, currentRoom, placements));
      }
      if (layoutChanged) {
        const existingLayouts = parseRoomLayoutsContent(prev.content);
        updates.room_layouts = { v: 1, by_room: { ...existingLayouts?.by_room, [currentRoom]: layoutDraft } } satisfies RoomLayoutsContent;
      }
      const event = await publishEvent({
        kind: KIND_BLOBBONAUT_PROFILE,
        content: serializeProfileContent(prev.content, updates),
        tags: prev.tags,
        prev,
      });
      updateProfileEvent(event);
      toast({
        title: intl.formatMessage({ id: 'blobbiRoom.save.saved', defaultMessage: 'Saved' }),
        description: intl.formatMessage(
          { id: 'blobbiRoom.save.savedDescription', defaultMessage: '{room} decorated.' },
          { room: intl.formatMessage(ROOM_META[currentRoom].label) },
        ),
      });
      handleCloseDecorator();
    } catch (error) {
      toast({
        title: intl.formatMessage({ id: 'blobbiRoom.save.error', defaultMessage: 'Error' }),
        description: error instanceof RoomFurnitureTooNewError
          ? intl.formatMessage({ id: 'blobbiRoom.save.tooNew', defaultMessage: 'Your rooms were saved by a newer version of the app. Update to keep decorating.' })
          : intl.formatMessage({ id: 'blobbiRoom.save.failed', defaultMessage: 'Failed to save the room.' }),
      });
    } finally {
      setIsSavingRoom(false);
    }
  }, [user?.pubkey, nostr, furnitureDraft, layoutDraft, currentRoom, publishEvent, updateProfileEvent, handleCloseDecorator, intl]);

  const handleFurnitureMove = useCallback((index: number, placement: FurniturePlacement) => {
    setFurnitureDraft((prev) => prev?.map((item, i) => (i === index ? placement : item)) ?? prev);
  }, []);

  // Going to another room while decorating discards the draft
  useEffect(() => {
    handleCloseDecorator();
  }, [userRoom, handleCloseDecorator]);

  // ─── Stat Guide Flow ───
  const [guideTarget, setGuideTarget] = useState<GuideTarget | null>(null);

  // Start a guide: build the target and set state
  // Tapping a stat takes you to the room that restores it, then points at the item or action
  const handleGuide = useCallback((stat: keyof BlobbiStats) => {
    const target = buildGuideTarget(stat, currentRoom);
    if (isSleeping || target.targetRoom === currentRoom) {
      setGuideTarget(target);
      return;
    }
    setGuideTarget(buildGuideTarget(stat, target.targetRoom));
    setStoredRoom(target.targetRoom);
  }, [currentRoom, isSleeping, setStoredRoom]);

  // Sync guide step with current room:
  // - entering the target room advances from 'room' to 'item'/'action'
  // - leaving the target room reverts back to 'room'
  useEffect(() => {
    if (!guideTarget) return;
    const inTargetRoom = currentRoom === guideTarget.targetRoom;
    if (guideTarget.step === 'room' && inTargetRoom) {
      setGuideTarget(prev => prev ? { ...prev, step: prev.targetType } : null);
    } else if (guideTarget.step !== 'room' && !inTargetRoom) {
      setGuideTarget(prev => prev ? { ...prev, step: 'room' } : null);
    }
  }, [currentRoom, guideTarget]);

  // Derived: room direction glow (null when already in the correct room)
  const guideRoomDirection = useMemo(() => {
    if (!guideTarget || guideTarget.step !== 'room') return null;
    return getGuideRoomDirection(currentRoom, guideTarget.targetRoom, DEFAULT_ROOM_ORDER);
  }, [guideTarget, currentRoom]);

  // Derived: carousel item highlight (only when in correct room + on 'item' step)
  const guideHighlightId = guideTarget?.step === 'item' ? guideTarget.targetItemId : null;

  // Derived: action glow (only when in correct room + on 'action' step)
  const guideActionGlow = guideTarget?.step === 'action' ? guideTarget.targetAction : null;

  
  const closeDrawer = useCallback(() => setActiveDrawer('none'), []);

  // Toggle drawer: tapping same tab closes it, tapping another opens that one
  const toggleDrawer = useCallback((drawer: DashboardDrawer) => {
    setActiveDrawer(prev => prev === drawer ? 'none' : drawer);
  }, []);

  // Build naddr for linking to the Blobbi's detail page
  const blobbiNaddr = useMemo(() => nip19.naddrEncode({
    kind: KIND_BLOBBI_STATE,
    pubkey: companion.event.pubkey,
    identifier: companion.d,
  }), [companion.event.pubkey, companion.d]);
  
  // Derive available stages from all companions (for daily mission filtering)
  const availableStages = useMemo(() => {
    const stages = new Set<'egg' | 'baby' | 'adult'>();
    for (const c of companions) {
      stages.add(c.stage);
    }
    return Array.from(stages);
  }, [companions]);
  
  // Check if this Blobbi is currently the active floating companion
  // If so, we hide the visual here to avoid duplication (one floating, one in-page)
  const { companion: activeCompanion } = useBlobbiCompanionData();
  const isActiveFloatingCompanion = activeCompanion?.d === companion.d;
  
  // Projected state with decay applied (UI-only, recalculates every 60s).
  // Owner surfaces use decay-only — social effects are incorporated via
  // explicit consolidation, not pre-applied projection.
  const projectedState = useProjectedBlobbiState(companion);

  // Clear sleep guide after companion actually enters sleeping state
  useEffect(() => {
    if (isSleeping && guideTarget?.targetAction === 'sleep') {
      setGuideTarget(null);
    }
  }, [isSleeping, guideTarget]);
  
  // Measure stage overlay for ref usage
  
  // Modal states (only for things that genuinely need modals)
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [showHatchCeremony, setShowHatchCeremony] = useState(false);
  const [showEvolveCeremony, setShowEvolveCeremony] = useState(false);
  
  // Reset hatch/evolve ceremony when switching companions
  useEffect(() => {
    setShowHatchCeremony(false);
    setShowEvolveCeremony(false);
  }, [selectedD]);
  
  // DEV ONLY: Emotion panel state
  const [showEmotionPanel, setShowEmotionPanel] = useState(false);
  
  // DEV ONLY: Get effective emotion (dev override or base)
  const devEmotionOverride = useEffectiveEmotion();
  
  // Temporary action override used by drag-to-feed / chewing flow.
  const [actionOverrideEmotion, setActionOverrideEmotion] = useState<BlobbiEmotion | null>(null);

  // Music/sing override — persistent while the activity is active (not auto-clearing).
  // Separate from interactionReaction because music is a duration-based activity,
  // not a short reward reaction.
  const [musicOverrideEmotion, setMusicOverrideEmotion] = useState<BlobbiEmotion | null>(null);
  
  // Status-based automatic reactions (recipe-first pipeline).
  // Uses projected stats (with decay applied) for accurate reactions.
  // Body effects (dirt, stink) are folded into the recipe by the resolver —
  // no separate bodyEffects prop needed.
  //
  // Override priority: action override > interaction reaction > music override > status reactions.
  const currentStats = useMemo(() => ({
    hunger: projectedState?.stats.hunger ?? companion.stats.hunger ?? 100,
    happiness: projectedState?.stats.happiness ?? companion.stats.happiness ?? 100,
    health: projectedState?.stats.health ?? companion.stats.health ?? 100,
    hygiene: projectedState?.stats.hygiene ?? companion.stats.hygiene ?? 100,
    energy: projectedState?.stats.energy ?? companion.stats.energy ?? 100,
  }), [projectedState, companion.stats]);

  // ─── Poop (ephemeral: made up from hunger and time since the last feed when the page opens) ───
  const makeInitialPoops = () => companion.stage === 'egg' ? [] : generateInitialPoops(
    currentStats.hunger,
    companion.lastInteraction ? companion.lastInteraction * 1000 : undefined,
  );
  const [poopState, setPoops] = useState<PoopInstance[]>(makeInitialPoops);
  // Each Blobbi has its own mess: made up afresh when switching to another
  const [poopsFor, setPoopsFor] = useState(companion.d);
  if (poopsFor !== companion.d) {
    setPoopsFor(companion.d);
    setPoops(makeInitialPoops());
  }
  // Eggs don't poop
  const poops = companion.stage === 'egg' ? NO_POOPS : poopState;
  /** Overfeeding sometimes makes a mess. Check with the hunger from before the feed. */
  const maybeOverfeedPoop = useCallback((action: string | null | undefined, hungerBefore: number) => {
    if (action === 'feed' && hungerBefore >= OVERFEED_THRESHOLD && Math.random() < OVERFEED_CHANCE) setPoops(addPoop);
  }, []);
  
  // Combined emotion override: interaction reaction wins over music.
  const combinedEmotionOverride =
  actionOverrideEmotion ??
  interactionReaction.emotionOverride ??
  musicOverrideEmotion;

  const { recipe: rawStatusRecipe, recipeLabel: rawStatusRecipeLabel } = useStatusReaction({
    stats: currentStats,
    enabled: !isEgg, // Keep enabled during sleep so body effects still resolve
    actionOverride: isSleeping ? null : combinedEmotionOverride,
  });

  // When sleeping, overlay the sleeping face on top of the status recipe.
  // This keeps body effects (dirty, stink) and food icon while overriding
  // eyes, mouth, and eyebrows with sleeping visuals.
  const statusRecipe = isSleeping
    ? buildSleepingRecipe(rawStatusRecipe)
    : rawStatusRecipe;
  const statusRecipeLabel = isSleeping ? 'sleeping' : rawStatusRecipeLabel;
  
  // Final recipe: dev override uses named emotion; status system uses resolved recipe
  const hasDevOverride = isLocalhostDev() && devEmotionOverride !== 'neutral';
  const effectiveEmotion: BlobbiEmotion = hasDevOverride ? devEmotionOverride : 'neutral';
  
  // Adoption flow modal state
  const [showAdoptionFlow, setShowAdoptionFlow] = useState(false);
  
  const [usingItemId, setUsingItemId] = useState<string | null>(null);
  
  // Track selection modal (for changing tracks in music player)
  const [showTrackPickerModal, setShowTrackPickerModal] = useState(false);
  
  // Inline activity state - only one activity can be active at a time
  const [inlineActivity, setInlineActivity] = useState<InlineActivityState>(createNoActivity());
  
  // Blobbi reaction state - drives visual reactions to activities
  const [blobbiReaction, setBlobbiReaction] = useState<BlobbiReactionState>('idle');
  
  // State detection for tasks
  // Note: isEvolving prop = mutation pending state, isEvolvingState = companion in evolving state
  const isIncubating = companion.progressionState === 'incubating';
  const isEvolvingState = companion.progressionState === 'evolving';
  const isBaby = companion.stage === 'baby';
  const canStartIncubation = isEgg && !isIncubating && !isEvolvingState;
  const canStartEvolution = isBaby && !isEvolvingState && !isIncubating;
  
  // Daily missions (per-user, kind 11125)
  const dailyMissions = useDailyMissions({ pubkey: user?.pubkey, availableStages, profileContent: profile?.content });
  
  // Hatch tasks hook - only active when incubating (egg stage)
  // Evolution missions now come from companion (kind 31124), not dailyMissions
  const hatchTasks = useHatchTasks(
    isIncubating ? companion : null,
    user?.pubkey,
  );
  
  // Evolve tasks hook - only active when evolving (baby stage)
  // Evolution missions now come from companion (kind 31124), not dailyMissions
  const evolveTasks = useEvolveTasks(
    isEvolvingState ? companion : null,
    user?.pubkey,
  );
  
  // ─── Unified Task Process Abstraction ───
  // This hook consolidates all scattered if/else logic for hatch vs evolve tasks
  // It provides:
  // - Unified config (type, isActive, interactionThreshold)
  // Start incubation hook
  const { mutateAsync: startIncubation, isPending: isStartingIncubation } = useStartIncubation({
    companion,
    profile,
    ensureCanonicalBeforeAction,
    updateCompanionEvent,
  });
  
  // Stop incubation hook
  const { mutateAsync: stopIncubation, isPending: isStoppingIncubation } = useStopIncubation({
    companion,
    ensureCanonicalBeforeAction,
    updateCompanionEvent,
  });
  
  // Start evolution hook
  const { mutateAsync: startEvolution, isPending: isStartingEvolution } = useStartEvolution({
    companion,
    ensureCanonicalBeforeAction,
    updateCompanionEvent,
  });
  
  // Stop evolution hook
  const { mutateAsync: stopEvolution, isPending: isStoppingEvolution } = useStopEvolution({
    companion,
    ensureCanonicalBeforeAction,
    updateCompanionEvent,
  });
  
  // ─── Set as Companion ───
  // Determines if this Blobbi is currently set as the user's companion
  const isCurrentCompanion = profile?.currentCompanion === companion.d;
  
  // State for tracking companion update in progress
  const [isUpdatingCompanion, setIsUpdatingCompanion] = useState(false);
  
  // Check if this Blobbi can be set as companion (must be baby or adult, not egg)
  const canBeCompanion = companion.stage === 'egg' || companion.stage === 'baby' || companion.stage === 'adult';
  
  // Handler for toggling the current companion
  const handleSetAsCompanion = useCallback(async () => {
    if (!profile) return;
    
    // Validate stage when setting (not when unsetting)
    if (!isCurrentCompanion && !canBeCompanion) {
      toast({
        title: 'Cannot set as companion',
        description: 'Only hatched Blobbis (baby or adult) can be set as your companion.',
        variant: 'destructive',
      });
      return;
    }
    
    setIsUpdatingCompanion(true);
    
    try {
      // Fetch fresh profile data from relays to avoid stale-read-then-write
      const canonical = await ensureCanonicalBeforeAction();
      if (!canonical) return;

      let updatedTags: string[][];
      
      if (isCurrentCompanion) {
        // Remove companion: filter out all current_companion tags entirely
        updatedTags = updateBlobbonautTags(canonical.profileAllTags, {})
          .filter(tag => tag[0] !== 'current_companion');
      } else {
        // Set companion: first remove any existing current_companion tags, then add the new one
        const tagsWithoutCompanion = canonical.profileAllTags.filter(tag => tag[0] !== 'current_companion');
        updatedTags = updateBlobbonautTags(tagsWithoutCompanion, {
          current_companion: companion.d,
        });
      }
      
      const prev = canonical.profileEvent;
      const event = await publishEvent({
        kind: KIND_BLOBBONAUT_PROFILE,
        content: prev.content,
        tags: updatedTags,
        prev,
      });
      
      updateProfileEvent(event);
      invalidateProfile();
      
      toast({
        title: isCurrentCompanion ? 'Companion unset' : 'Companion set!',
        description: isCurrentCompanion 
          ? `${companion.name} is no longer your companion`
          : `${companion.name} is now your companion`,
      });
    } catch (error) {
      console.error('Failed to update companion:', error);
      toast({
        title: 'Failed to update companion',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingCompanion(false);
    }
  }, [profile, isCurrentCompanion, canBeCompanion, companion.d, companion.name, ensureCanonicalBeforeAction, publishEvent, updateProfileEvent, invalidateProfile]);
  
  // Handler for starting incubation with explicit mode from dialog
  const handleStartIncubation = async (mode: StartIncubationMode, stopOtherD?: string) => {
    try {
      await startIncubation({ mode, stopOtherD });
    } catch (error) {
      console.error('Failed to start incubation:', error);
    }
  };
  
  // Handler for starting evolution
  const handleStartEvolution = async () => {
    try {
      await startEvolution();
    } catch (error) {
      console.error('Failed to start evolution:', error);
    }
  };
  
  // Handler for stopping incubation
  const handleStopIncubation = async () => {
    await stopIncubation();
  };
  
  // Handler for stopping evolution
  const handleStopEvolution = async () => {
    await stopEvolution();
  };
  
  // Handle opening a direct action (now opens inline card)
  const handleDirectAction = (action: DirectAction) => {
    if (action === 'play_music') {
      setShowTrackPickerModal(true);
    } else if (action === 'sing') {
      setInlineActivity(createSingActivity());
    }
  };
  
  // Handle track selected from picker - creates inline music player or changes track
  const handleTrackSelected = async (selection: SelectedTrack) => {
    setShowTrackPickerModal(false);
    
    // Check if we're changing an existing track (already published) or selecting initial track
    const isChangingTrack = inlineActivity.type === 'music' && inlineActivity.isPublished;
    
    if (isChangingTrack) {
      // Just update the selection, keep isPublished: true
      // The InlineMusicPlayer will detect the URL change and reload
      setInlineActivity(prev => 
        prev.type === 'music' ? { ...prev, selection } : prev
      );
    } else {
      // Initial track selection - need to publish the action
      setInlineActivity(createMusicActivity(selection));
      
      // Publish the action first, then playback will start after publish succeeds
      try {
        await onDirectAction('play_music');
        // Mark as published so playback can begin
        setInlineActivity(prev => 
          prev.type === 'music' ? { ...prev, isPublished: true } : prev
        );
      } catch {
        // If publish fails, close the activity
        setInlineActivity(createNoActivity());
      }
    }
  };
  
  // Handle confirming sing action (called from InlineSingCard)
  const handleConfirmSing = async () => {
    await onDirectAction('sing');
  };
  
  // Handle closing inline activities
  const handleCloseInlineActivity = () => {
    setInlineActivity(createNoActivity());
    setBlobbiReaction('idle');
    setMusicOverrideEmotion(null);
  };
  
  // Handle music playback state changes (for Blobbi reaction)
  const handleMusicPlaybackStart = () => {
    setBlobbiReaction('listening');
    setMusicOverrideEmotion(getActionEmotion('music'));
  };
  
  const handleMusicPlaybackStop = () => {
    setBlobbiReaction('idle');
    setMusicOverrideEmotion(null);
  };
  
  // Handle sing recording state changes (for Blobbi reaction)
  const handleSingRecordingStart = () => {
    setBlobbiReaction('singing');
    setMusicOverrideEmotion(getActionEmotion('sing'));
  };
  
  const handleSingRecordingStop = () => {
    setBlobbiReaction('idle');
    setMusicOverrideEmotion(null);
  };
  
  // Handle opening track picker to change track (from inline player)
  const handleChangeTrack = () => {
    setShowTrackPickerModal(true);
  };
  
  // Persist evolution mission progress (debounced) to kind 31124 so it survives page refresh
  usePersistEvolutionProgress({
    pubkey: user?.pubkey,
    companionD: companion.d,
    publish: publishEvent,
    updateCompanionEvent,
  });

  // Persist daily mission progress (debounced) to kind 11125 so it survives page refresh
  usePersistDailyProgress({
    pubkey: user?.pubkey,
    publish: publishEvent,
    updateProfileEvent,
  });

  // Award XP when all daily missions are complete
  const { mutate: awardDailyXp } = useAwardDailyXp(updateProfileEvent);
  const dailyXpAwardedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!dailyMissions.allComplete || !dailyMissions.raw) return;
    // Only award once per date
    const dateKey = dailyMissions.raw.date;
    if (dailyXpAwardedRef.current === dateKey) return;
    dailyXpAwardedRef.current = dateKey;
    awardDailyXp({ missions: dailyMissions.raw });
  }, [dailyMissions.allComplete, dailyMissions.raw, awardDailyXp]);

  // ─── Poop Cleanup XP (debounced: batch multiple pickups into one publish) ───
  const pendingPoopXpRef = useRef(0);
  const poopXpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanPoop = useCallback((id: string) => {
    if (!poops.some(p => p.id === id)) return;
    setPoops(prev => prev.filter(p => p.id !== id));
    pendingPoopXpRef.current += POOP_CLEANUP_XP;
    toast({ title: `+${POOP_CLEANUP_XP} XP`, description: 'Cleaned up!' });

    // Debounce: wait 1.5s after last pickup, then publish all accumulated XP
    if (poopXpTimerRef.current) clearTimeout(poopXpTimerRef.current);
    poopXpTimerRef.current = setTimeout(async () => {
      const xpToAdd = pendingPoopXpRef.current;
      pendingPoopXpRef.current = 0;
      if (xpToAdd <= 0) return;

      try {
        const canonical = await ensureCanonicalBeforeAction();
        if (!canonical) return;

        const currentXP = canonical.companion.experience ?? 0;
        const newXP = applyXPGain(currentXP, xpToAdd);

        const newTags = updateBlobbiTags(canonical.allTags, {
          experience: newXP.toString(),
        });

        const event = await publishEvent({
          kind: KIND_BLOBBI_STATE,
          content: canonical.content,
          tags: newTags,
          prev: canonical.companion.event,
        });

        updateCompanionEvent(event);
      } catch (error) {
        console.error('Failed to persist poop cleanup XP:', error);
      }
    }, 1500);
  }, [poops, ensureCanonicalBeforeAction, publishEvent, updateCompanionEvent]);

  // Shared timer ref for temporary action-emotion cleanup.
  // Used across the current feeding/item interaction paths so older timers
  // do not clear a newer visual state.
  const actionCleanupRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Handle using an item from the items tab
  const guideTargetRef = useRef(guideTarget);
  guideTargetRef.current = guideTarget;

  // Handle tap-based item use.
  // Non-food actions use this path from room bars, and the fridge still uses it for food for now.
  // Triggers a temporary interaction reaction based on the action type.
  // For 'clean' actions, detects whether the Blobbi was visibly dirty before
  // the action and uses 'clean_complete' if the dirt was fully removed.
  const handleUseItemFromTab = useCallback((itemId: string) => {
    const action = getActionForItem(itemId);
    if (!action || isUsingItem) return;
    clearTimeout(actionCleanupRef.current);
    setUsingItemId(itemId);

    // Snapshot hygiene before the action for clean_complete detection.
    // "Visibly dirty" = hygiene below the warning threshold (< 70).
    const wasDirtyBefore = action === 'clean'
      && currentStats.hygiene < SEVERITY_THRESHOLDS.warning;

    // Map inventory action to reaction type (feed/play/clean/medicine → reaction).
    const reactionType = INVENTORY_TO_REACTION[action] ?? 'feed';

    // For non-clean actions, trigger immediately (facial expression before action completes).
    if (action !== 'clean') {
      triggerInteractionReaction(reactionType);
    }

    onUseItem(itemId, action).then(() => {
      // Clear guide only after the action succeeds
      if (guideTargetRef.current?.targetItemId === itemId) setGuideTarget(null);

      // For clean actions, trigger after the action succeeds so we can
      // detect clean_complete from the updated projected stats.
      if (action === 'clean') {
        // After the action, the companion cache is already updated.
        // The projected state will recalculate on next render, but we can
        // check whether the item's hygiene effect crossed the threshold.
        // The action result doesn't return the new hygiene value directly,
        // so we use the item's known effect + snapshot.
        const shopItem = getShopItemById(itemId);
        const hygieneGain = shopItem?.effect?.hygiene ?? 0;
        const projectedHygiene = currentStats.hygiene + hygieneGain;
        const isNowClean = projectedHygiene >= SEVERITY_THRESHOLDS.warning;

        if (wasDirtyBefore && isNowClean) {
          triggerInteractionReaction('clean_complete');
        } else {
          triggerInteractionReaction('clean');
        }
      }
    }).finally(() => {
      setUsingItemId(null);
      actionCleanupRef.current = setTimeout(() => setActionOverrideEmotion(null), 1500);
    });
  }, [isUsingItem, onUseItem, currentStats.hygiene, triggerInteractionReaction]);

  // ─── Food drag-to-feed ───────────────────────────────────────────────────
  //
  // Timing constants — tweak these to tune how the feed reward feels.
  const CHEW_DURATION_MS = 1200;   // chewing animation before → happy
  const CRUMB_DURATION_MS = 1200;  // how long crumb particles stay visible
  const HAPPY_DURATION_MS = 1500;  // happy face after chewing
  const CRUMB_Y_OFFSET = 4;      // px below the mouth center where crumbs spawn
  const REWARD_Y_RATIO = 0.08;    // fraction of visual height from top for reward text
  //
  // Visual sequence:
  //   eating (open mouth) → chewing + crumbs (CHEW_DURATION_MS) → happy (HAPPY_DURATION_MS) → null
  // Mutation timing:  starts immediately on drop — no delay.
  //
  // The chewing phase is purely visual. The mutation fires right away so
  // Nostr publishing and stat changes are not blocked by the animation.
  // If the mutation fails, we skip the happy phase and clear the override.
  //
  // Race-condition strategy:
  //   feedSeqRef  — monotonically increasing counter. Every timer and promise
  //                 continuation captures the value at invocation and bails
  //                 out if a newer sequence has started.
  //   mountedRef  — set to false on unmount. All continuations check this
  //                 before calling setState.

  const [crumbBurst, setCrumbBurst] = useState<{
    crumbX: number; crumbY: number;   // crumb particle origin (just below the mouth)
    rewardX: number; rewardY: number; // reward text anchor (above the head)
  } | null>(null);

  const feedSeqRef = useRef(0);
  const mountedRef = useRef(true);

  // Timer refs for chew→happy transition, happy→null cleanup, crumb cleanup,
  // and a hard safety timeout that prevents chewing from getting stuck.
  const chewTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const happyTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const crumbTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const clearFeedTimers = useCallback(() => {
    clearTimeout(actionCleanupRef.current);
    actionCleanupRef.current = undefined;
    clearTimeout(chewTimerRef.current);
    chewTimerRef.current = undefined;
    clearTimeout(happyTimerRef.current);
    happyTimerRef.current = undefined;
    clearTimeout(crumbTimerRef.current);
    crumbTimerRef.current = undefined;
    clearTimeout(safetyTimerRef.current);
    safetyTimerRef.current = undefined;
  }, []);

  // Clean up all feed timers and mark unmounted.
  useEffect(() => () => {
    mountedRef.current = false;
    clearFeedTimers();
  }, [clearFeedTimers]);

  const handleNearMouthChange = useCallback((near: boolean) => {
    setActionOverrideEmotion(near ? 'eating' : null);
  }, []);

  /** Drag-to-feed handler: fires mutation immediately, overlays chewing
   *  animation for CHEW_DURATION_MS, then transitions to happy if the
   *  mutation succeeded, or clears the override on failure.
   *
   *  Every async continuation (timer callbacks, .then, .finally) captures
   *  the current `seq` value and checks `seq === feedSeqRef.current` before
   *  writing state. If a newer sequence has started (or the component
   *  unmounted), the continuation is a no-op. */
  const handleFeedFromDrag = useCallback((itemId: string, playSound = true) => {
    const action = getActionForItem(itemId);
    if (!action || isUsingItem) return;

    // Cancel any in-flight feed animation timers from a prior sequence.
    clearFeedTimers();

    // Stamp this sequence so all continuations can verify ownership.
    const seq = ++feedSeqRef.current;

    /** Guard: returns true only when this sequence is still active and
     *  the component is mounted. Every continuation calls this before
     *  touching React state. */
    const isActive = () => mountedRef.current && seq === feedSeqRef.current;

    // ── Overfeed check (must run before the mutation fires) ──
    maybeOverfeedPoop(action, companion.stats.hunger ?? 0);

    // ── Lock + visual + audio ──
    setUsingItemId(itemId);
    setActionOverrideEmotion('chewing');
    // Food set down on the floor already munched when the Blobbi got to it
    if (playSound) playMunchSound();

    // Spawn crumb particles just below the mouth, and anchor the reward
    // text above the head.
    //
    // The crumb origin is read from the actual chewing-mouth element
    // (marked with data-blobbi-mouth) so crumbs align with the real
    // mouth regardless of adult variant.  Falls back to the visual
    // bounding box ratio when the marker is absent (e.g. Owli/beak).
    //
    // Wrapped in requestAnimationFrame so the DOM query runs *after*
    // React has committed the chewing mouth from the state update above.
    // Without this, the query would see the previous eating/neutral
    // mouth (or no marker at all) because React 18 batches setState.
    //
    // Reward text: always anchored above the head via the visual rect.
    const el = document.querySelector<HTMLElement>('[data-blobbi-visual]');
    if (el) {
      requestAnimationFrame(() => {
        if (!isActive()) return;

        const r = el.getBoundingClientRect();
        const mouthEl = el.querySelector<SVGElement>('[data-blobbi-mouth]');
        let crumbOriginX: number;
        let crumbOriginY: number;
        if (mouthEl) {
          const mr = mouthEl.getBoundingClientRect();
          crumbOriginX = mr.left + mr.width / 2;
          crumbOriginY = mr.top + mr.height / 2 + CRUMB_Y_OFFSET;
        } else {
          crumbOriginX = r.left + r.width * 0.5;
          crumbOriginY = r.top + r.height * 0.67 + CRUMB_Y_OFFSET;
        }

        setCrumbBurst({
          crumbX: crumbOriginX,
          crumbY: crumbOriginY,
          rewardX: r.left + r.width * 0.5,
          rewardY: r.top + r.height * REWARD_Y_RATIO,
        });
        crumbTimerRef.current = setTimeout(() => {
          if (isActive()) setCrumbBurst(null);
        }, CRUMB_DURATION_MS);
      });
    }

    // ── Mutation starts NOW — no delay ──
    //
    // Two async boundaries must both complete before the post-chew
    // transition fires:
    //   1. The CHEW_DURATION_MS chewing timer  (visual minimum)
    //   2. The onUseItem promise               (mutation)
    //
    // `mutationResult` is 'pending' until the promise settles, then
    // 'ok' or 'failed'. `chewDone` flips to true when the timer fires.
    // Whichever boundary fires second sees both flags set and calls
    // `tryTransition()`, which applies the correct emotion once.

    let mutationResult: 'pending' | 'ok' | 'failed' = 'pending';
    let chewDone = false;

    /** Apply the post-chew emotion. Only called when BOTH the chew timer
     *  has elapsed AND the mutation has settled. Guarded by isActive(). */
    const tryTransition = () => {
      if (!chewDone || mutationResult === 'pending') return;
      if (!isActive()) return;
      // Normal flow completed — cancel the safety timeout.
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = undefined;
      if (mutationResult === 'ok') {
        setActionOverrideEmotion('happy');
        happyTimerRef.current = setTimeout(() => {
          if (isActive()) setActionOverrideEmotion(null);
        }, HAPPY_DURATION_MS);
      } else {
        setActionOverrideEmotion(null);
      }
    };

    onUseItem(itemId, action).then(
      () => {
        mutationResult = 'ok';
        if (isActive() && guideTarget?.targetItemId === itemId) {
          setGuideTarget(null);
        }
      },
      () => { mutationResult = 'failed'; },
    ).finally(() => {
      if (isActive()) setUsingItemId(null);
      tryTransition();
    });

    // ── After chewing phase, check if mutation also settled ──
    chewTimerRef.current = setTimeout(() => {
      chewDone = true;
      tryTransition();
    }, CHEW_DURATION_MS);

    // ── Hard safety timeout ──
    // If the mutation promise never settles (network hang, relay timeout,
    // TanStack Query edge case), chewing would stay on forever.  This
    // forces a clear after 5 seconds regardless.  Cleared by tryTransition
    // when the normal flow completes, and by clearFeedTimers on new
    // sequence / unmount.
    safetyTimerRef.current = setTimeout(() => {
      if (isActive()) {
        setActionOverrideEmotion(null);
        setUsingItemId(null);
      }
    }, 5000);
  }, [isUsingItem, onUseItem, guideTarget, clearFeedTimers, companion.stats.hunger, maybeOverfeedPoop]);

  // ─── Setting things down in the room ───────────────────────────────────
  //
  // Items dragged from the dock land on the floor where they're dropped; the
  // Blobbi walks over and spends CONSUME_MS eating or using it, and only then
  // is the item used (and the care credit published). Other Blobbis dragged
  // in from the drawer come to visit.

  const CONSUME_MS = 1800;
  /** Longer than any walk across the room. */
  const APPROACH_TIMEOUT_MS = 15_000;
  const MAX_GUESTS = 3;
  const [dropped, setDropped] = useState<{ key: string; itemId: string; emoji: string; x: number; z: number; eating: boolean } | null>(null);
  const droppedRef = useRef(dropped);
  droppedRef.current = dropped;
  const consumeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(consumeTimerRef.current), []);
  // Read by the walk and eat callbacks, which outlive the render that set them up
  const roomRef = useRef(currentRoom);
  roomRef.current = currentRoom;
  // Anything set down is left behind when you leave the room or switch Blobbis
  useEffect(() => {
    clearTimeout(consumeTimerRef.current);
    if (droppedRef.current?.eating) setActionOverrideEmotion(null);
    droppedRef.current = null;
    setDropped(null);
  }, [currentRoom, companion.d]);

  const consumeItem = useCallback((itemId: string, playSound = true) => {
    if (getActionForItem(itemId) === 'feed') handleFeedFromDrag(itemId, playSound);
    else handleUseItemFromTab(itemId);
  }, [handleFeedFromDrag, handleUseItemFromTab]);
  const consumeItemRef = useRef(consumeItem);
  consumeItemRef.current = consumeItem;

  const guestsKey = `blobbi:guests:${user?.pubkey ?? 'anon'}`;
  const [guestsByRoom, setGuestsByRoom] = useLocalStorage<Record<string, { d: string; x?: number; z?: number }[]>>(guestsKey, {});
  const roomGuestEntries = useMemo(
    () => (guestsByRoom[currentRoom] ?? []).filter(g => g.d !== companion.d && companions.some(c => c.d === g.d)),
    [guestsByRoom, currentRoom, companion.d, companions],
  );
  const setRoomGuest = useCallback((d: string, visit: boolean, spot?: { x: number; z: number }) => {
    setGuestsByRoom(prev => {
      const list = (prev[currentRoom] ?? []).filter(g => g.d !== d);
      return { ...prev, [currentRoom]: visit ? [...list, { d, ...spot }].slice(-MAX_GUESTS) : list };
    });
  }, [setGuestsByRoom, currentRoom]);

  const [meeting, setMeeting] = useState<Set<string>>(() => new Set());
  const meetTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => () => meetTimers.current.forEach(clearTimeout), []);
  const handleMeet = useCallback((id: string) => {
    setMeeting(prev => new Set(prev).add(id));
    clearTimeout(meetTimers.current.get(id));
    meetTimers.current.set(id, setTimeout(() => {
      setMeeting(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 2600));
    if (!isEgg) triggerInteractionReaction('social_hearts');
  }, [isEgg, triggerInteractionReaction]);

  const roomDrag = useRoomDrag({
    onLift: (payload) => {
      // Guests come from the drawer: get it out of the way to show the room
      if (payload.kind === 'guest') setActiveDrawer('none');
    },
    onTap: (payload) => {
      if (payload.kind === 'guest') setRoomGuest(payload.d, !roomGuestEntries.some(g => g.d === payload.d));
    },
    onHover: (payload, point) => {
      if (payload.kind === 'shovel') markPoopUnder(point);
      if (payload.kind !== 'item' || droppedRef.current || getActionForItem(payload.itemId) !== 'feed') return;
      handleNearMouthChange(!!point && isNearMouth(point.x, point.y));
    },
    onDrop: (payload, clientX, clientY) => {
      if (payload.kind === 'shovel') {
        const id = poopAt(clientX, clientY)?.dataset.poopId;
        if (id) cleanPoop(id);
        return;
      }
      const control = roomControlRef.current;
      const spot = control?.floorAt(clientX, clientY) ?? null;
      if (payload.kind === 'guest') {
        if (spot) setRoomGuest(payload.d, true, spot);
        return;
      }
      // Food dropped on the Blobbi's mouth is eaten right away, as its eating face
      // promised; without the 3D room there's no floor, so anything is used that way
      const toMouth = !control || getActionForItem(payload.itemId) === 'feed';
      if (toMouth && !droppedRef.current && isNearMouth(clientX, clientY)) {
        consumeItem(payload.itemId);
        return;
      }
      if (!control || !spot) return;
      if (droppedRef.current || isUsingItem) {
        toast({
          title: intl.formatMessage({ id: 'blobbiRoom.drop.busy', defaultMessage: '{name} is busy' }, { name: companion.name }),
          description: intl.formatMessage({ id: 'blobbiRoom.drop.busyDescription', defaultMessage: 'Let them finish first.' }),
        });
        return;
      }
      const key = `${payload.itemId}-${Date.now()}`;
      const itemId = payload.itemId;
      const room = currentRoom;
      const next = { key, itemId, emoji: payload.emoji, x: spot.x, z: spot.z, eating: false };
      // Set the ref now too: the Blobbi may already be standing there and arrive at once
      droppedRef.current = next;
      setDropped(next);
      // If the room goes away mid-walk (a lost WebGL context) the Blobbi never
      // arrives: leave the item behind rather than stay busy
      clearTimeout(consumeTimerRef.current);
      consumeTimerRef.current = setTimeout(() => {
        if (droppedRef.current?.key !== key) return;
        droppedRef.current = null;
        setDropped(null);
      }, APPROACH_TIMEOUT_MS);
      control.approach(spot.x, spot.z, () => {
        // Leaving the room ends the walk before the dropped item is cleared
        if (droppedRef.current?.key !== key || roomRef.current !== room) return;
        clearTimeout(consumeTimerRef.current);
        const isFood = getActionForItem(itemId) === 'feed';
        setDropped(d => (d && d.key === key ? { ...d, eating: true } : d));
        if (isFood) {
          setActionOverrideEmotion('eating');
          playMunchSound();
        }
        consumeTimerRef.current = setTimeout(() => {
          if (droppedRef.current?.key !== key) return;
          droppedRef.current = null;
          setDropped(null);
          if (isFood) setActionOverrideEmotion(null);
          consumeItemRef.current(itemId, false);
        }, CONSUME_MS);
      });
    },
  });

  const floorThings = useMemo((): RoomFloorThing[] => (dropped ? [{
    key: dropped.key,
    x: dropped.x,
    z: dropped.z,
    node: (
      <span className="absolute bottom-0 left-0 -translate-x-1/2">
        <span
          key={dropped.eating ? 'eating' : 'down'}
          className={cn(
            'block origin-bottom leading-none drop-shadow-md',
            dropped.eating
              ? 'motion-safe:animate-[blobbi-consume_1.8s_ease-in_forwards]'
              : 'motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:slide-in-from-top-4 motion-safe:duration-300',
          )}
          style={{ fontSize: 'clamp(30px, calc(var(--anchor-px, 40) * 1.05px), 84px)' }}
        >
          {dropped.emoji}
        </span>
      </span>
    ),
  }] : []), [dropped]);

  const roomGuests = useMemo((): RoomGuest[] => roomGuestEntries.flatMap(g => {
    const c = companions.find(x => x.d === g.d);
    if (!c) return [];
    return [{
      id: g.d,
      stage: c.stage,
      spawn: g.x !== undefined && g.z !== undefined ? { x: g.x, z: g.z } : undefined,
      node: <BlobbiGuestStage companion={c} meeting={meeting.has(g.d)} />,
    }];
  }), [roomGuestEntries, companions, meeting]);

  // ─── Kitchen fridge overlay (lifted here so it renders via roomOverlay, not inside the dock) ───
  const [showFridge, setShowFridge] = useState(false);
  // Close fridge when leaving the kitchen
  useEffect(() => { if (currentRoom !== 'kitchen') setShowFridge(false); }, [currentRoom]);

  // Something set down on the floor counts as in use until the Blobbi gets to it
  const isBusy = isUsingItem || dropped !== null;
  /** The room's actions wait while anything is in progress. */
  const roomBusy = isPublishing || actionInProgress !== null || isBusy;

  const handlePhoto = useCallback(() => {
    setShowPhotoModal(true);
    trackDailyMissionProgress('take_photo', 1, user?.pubkey);
  }, [user?.pubkey]);

  const foodItems = useMemo(() => {
    const items = getLiveShopItems().filter(i => i.type === 'food');
    return items.map(item => ({
      ...item,
      statChanges: previewStatChangesWithSegments(currentStats, item.effect, companion.stage),
    }));
  }, [currentStats, companion.stage]);

  const handleFeedItem = useCallback((itemId: string) => {
    maybeOverfeedPoop(getActionForItem(itemId), companion.stats.hunger ?? 0);
    handleUseItemFromTab(itemId);
  }, [companion.stats.hunger, handleUseItemFromTab, maybeOverfeedPoop]);

  const kitchenItems = useMemo<CarouselEntry[]>(() => [
    ...foodItems,
    ...getLiveShopItems().filter(i => i.id === 'nrg_drink'),
  ].map(i => ({ id: i.id, icon: <span>{i.icon}</span>, label: i.name })), [foodItems]);

  const itemDragHandlers = useItemDragHandlers(roomDrag);

  // Tapping a piece of furniture in the room uses it
  const handleInteract = useCallback((interaction: FurnitureInteraction) => {
    if (isActiveFloatingCompanion || roomBusy) return;
    // Asleep, the bed (to wake up) is the only thing that does anything
    if (isSleeping && interaction !== 'bed') return;
    const shop = getLiveShopItems();
    switch (interaction) {
      case 'fridge':
        setShowFridge(true);
        break;
      case 'bed':
        if (!isEgg) onRest();
        break;
      case 'bath': {
        const shampoo = shop.find(i => i.id === 'hyg_shampoo');
        if (shampoo) handleUseItemFromTab(shampoo.id);
        break;
      }
      case 'toys': {
        const toys = shop.filter(i => i.type === 'toy');
        const toy = toys[Math.floor(Math.random() * toys.length)];
        if (toy) handleUseItemFromTab(toy.id);
        break;
      }
    }
  }, [isActiveFloatingCompanion, roomBusy, isSleeping, isEgg, onRest, handleUseItemFromTab]);

  const decorEditor = useMemo((): RoomEditorBinding | undefined => {
    if (!isDecorating || !furnitureDraft || !layoutDraft) return undefined;
    return {
      selectedIndex: furnitureSelectedIndex,
      onSelect: setFurnitureSelectedIndex,
      onMove: handleFurnitureMove,
      onInvalidChange: setFurnitureInvalid,
      toolbar: furnitureSelectedIndex !== null ? (
        <RoomDecoratorToolbar
          draft={furnitureDraft}
          onDraftChange={setFurnitureDraft}
          selectedIndex={furnitureSelectedIndex}
          onSelect={setFurnitureSelectedIndex}
        />
      ) : undefined,
      overlay: (
        <RoomDecoratorOverlay
          roomId={currentRoom}
          draft={furnitureDraft}
          onDraftChange={setFurnitureDraft}
          layout={layoutDraft}
          onLayoutChange={setLayoutDraft}
          selectedIndex={furnitureSelectedIndex}
          onSelect={setFurnitureSelectedIndex}
          invalid={furnitureInvalid}
          objectIds={placedObjectIds}
          controlRef={roomControlRef}
          onSave={handleSaveRoom}
          onCancel={handleCloseDecorator}
          isSaving={isSavingRoom}
        />
      ),
    };
  }, [isDecorating, furnitureDraft, layoutDraft, furnitureSelectedIndex, handleFurnitureMove, furnitureInvalid, currentRoom, placedObjectIds, handleSaveRoom, handleCloseDecorator, isSavingRoom]);

  return (
    <DashboardShell>
      {/* ─── Room ─── */}
      <BlobbiRoomShell
        roomId={currentRoom}
        header={
          <div className={cn(
            'relative transition-opacity duration-200',
            ROOM_UI_SCALE,
            isDecorating && 'opacity-40 pointer-events-none',
          )}>

            {/* Tabs ride on the bottom of a drawer that pulls down over the room */}
            <RoomDrawer
              open={activeDrawer !== 'none'}
              onClose={closeDrawer}
              bar={
                <SubHeaderBar className="relative top-0! z-10" innerClassName="min-h-[3.25em]">
                  <TabButton label={intl.formatMessage({ id: 'blobbiRoom.tabs.quests', defaultMessage: 'Quests' })} active={activeDrawer === 'missions'} onClick={() => toggleDrawer('missions')}>
                    <span className="flex items-center gap-[0.4em] text-[1.05em]">
                      <Target className="size-[1.15em]" />
                      <span><FormattedMessage id="blobbiRoom.tabs.quests" defaultMessage="Quests" /></span>
                    </span>
                  </TabButton>
                  <TabButton label={intl.formatMessage({ id: 'blobbiRoom.tabs.activity', defaultMessage: 'Activity' })} active={activeDrawer === 'activity'} onClick={() => toggleDrawer('activity')}>
                    <span className="flex items-center gap-[0.4em] text-[1.05em]">
                      <Activity className="size-[1.15em]" />
                      <span><FormattedMessage id="blobbiRoom.tabs.activity" defaultMessage="Activity" /></span>
                    </span>
                  </TabButton>
                  <TabButton label={intl.formatMessage({ id: 'blobbiRoom.tabs.blobbis', defaultMessage: 'Blobbis' })} active={activeDrawer === 'more'} onClick={() => toggleDrawer('more')}>
                    <span className="flex items-center gap-[0.4em] text-[1.05em]">
                      <Egg className="size-[1.15em]" />
                      <span><FormattedMessage id="blobbiRoom.tabs.blobbis" defaultMessage="Blobbis" /></span>
                    </span>
                  </TabButton>
                </SubHeaderBar>
              }
            >
                <div className="text-base">
                  {activeDrawer === 'missions' && (
                    <MissionsTabContent
                      isIncubating={isIncubating}
                      isEvolvingState={isEvolvingState}
                      isEgg={isEgg}
                      isBaby={isBaby}
                      hatchTasks={hatchTasks}
                      evolveTasks={evolveTasks}
                      onHatch={async () => setShowHatchCeremony(true)}
                      isHatching={isHatching || showHatchCeremony}
                      onEvolve={async () => setShowEvolveCeremony(true)}
                      isEvolving={isEvolving || showEvolveCeremony}
                      onStopIncubation={handleStopIncubation}
                      isStoppingIncubation={isStoppingIncubation}
                      onStopEvolution={handleStopEvolution}
                      isStoppingEvolution={isStoppingEvolution}
                       dailyMissions={dailyMissions}
                      canStartIncubation={canStartIncubation}
                      canStartEvolution={canStartEvolution}
                      isStartingIncubation={isStartingIncubation}
                      isStartingEvolution={isStartingEvolution}
                      onStartIncubation={() => handleStartIncubation('start')}
                      onStartEvolution={handleStartEvolution}
                    />
                  )}
                  {activeDrawer === 'activity' && (
                    <ActivityTabContent
                      companion={companion}
                      projectedStats={currentStats}
                      socialOpen={companion.socialOpen}
                      onToggleSocial={handleToggleSocial}
                      isSocialToggling={isSocialToggling}
                      isEgg={isEgg}
                    />
                  )}
                  {activeDrawer === 'more' && (
                    <MoreTabContent
                      companion={companion}
                      companions={companions}
                      selectedD={selectedD}
                      profile={profile}
                      blobbiNaddr={blobbiNaddr}
                      onSelectBlobbi={onSelectBlobbi}
                      onAdopt={() => setShowAdoptionFlow(true)}
                      onDevOpenEditor={() => setShowDevEditor(true)}
                      onDevOpenEmotionPanel={() => setShowEmotionPanel(true)}
                      onDevInstantTransition={isEgg ? () => setShowHatchCeremony(true) : isBaby ? () => setShowEvolveCeremony(true) : undefined}
                      isHatching={isHatching}
                      isEvolving={isEvolving}
                      guestPicker={
                        <RoomGuestPicker
                          companions={companions.filter(c => c.d !== companion.d)}
                          visiting={new Set(roomGuestEntries.map(g => g.d))}
                          onPointerDown={(e, d) => roomDrag.start(e, { kind: 'guest', d })}
                          onToggle={(d) => setRoomGuest(d, !roomGuestEntries.some(g => g.d === d))}
                        />
                      }
                    />
                  )}
                </div>
            </RoomDrawer>
          </div>
        }
        onChangeRoom={(room) => {
          if (isSleeping) {
            toast({ title: 'Zzz...', description: `${companion.name} is sleeping. Wake up first!` });
            return;
          }
          setStoredRoom(room);
        }}
        guideRoomDirection={guideRoomDirection}
        hudVisible={activeDrawer === 'none'}
        isSleeping={isSleeping}
        blobbiStage={companion.stage}
        blobbiVisible={!isActiveFloatingCompanion}
        poops={poops}
        roomLayout={layoutDraft ?? currentRoomLayout}
        furniturePlacements={furnitureDraft ?? currentFurniturePlacements}
        onInteract={handleInteract}
        guests={roomGuests}
        onMeet={handleMeet}
        onBlobbiTap={(id) => { if (id !== MAIN_BLOBBI) handleMeet(id); }}
        floorThings={floorThings}
        editor={decorEditor}
        controlRef={roomControlRef}
        onDecorate={handleOpenDecorator}
        decorateDisabled={roomBusy}
        statusHud={
          !isActiveFloatingCompanion ? (
            <BlobbiRoomStatusHud
              companion={companion}
              currentStats={currentStats}
              onGuide={handleGuide}
            />
          ) : undefined
        }
        roomOverlay={showFridge ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/95 backdrop-blur-md motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200" onClick={() => setShowFridge(false)}>
            <div className="w-full max-w-md px-4" onClick={(e) => e.stopPropagation()}>
              <div className="relative flex items-center justify-center mb-4">
                <div className="flex items-center gap-2">
                  <Refrigerator className="size-5 text-orange-500" />
                  <h3 className="text-sm font-semibold">Fridge</h3>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowFridge(false); }}
                  className="absolute right-0 size-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={intl.formatMessage({ id: 'blobbiRoom.fridge.close', defaultMessage: 'Close fridge' })}
                >
                  <X className="size-5" strokeWidth={4} />
                </button>
              </div>

              <div className="flex flex-wrap justify-center gap-1">
                {foodItems.map(item => {
                const isThisUsing = isUsingItem && usingItemId === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleFeedItem(item.id)}
                    disabled={roomBusy}
                    className={cn(
                      'relative flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all duration-200',
                      'hover:bg-foreground/5 active:scale-95',
                      isThisUsing && 'bg-foreground/5',
                      roomBusy && !isThisUsing && 'opacity-40',
                    )}
                  >
                    <span className="text-4xl leading-none">{item.icon}</span>
                    <span className="text-[11px] font-medium text-foreground/80">{item.name}</span>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                      {item.statChanges.map((change) => {
                        const Icon = STAT_ICON[change.stat];
                        const positive = change.delta > 0;
                        const segDelta = change.segmentDelta;
                        return (
                          <span key={change.stat} className="flex items-center gap-0.5">
                            {Icon && <Icon className="size-3.5 text-muted-foreground/60" />}
                            <span className={cn('text-[11px] font-semibold tabular-nums', positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                              {positive ? '+' : ''}{change.delta}
                            </span>
                            {segDelta !== 0 && (
                              <span className="text-[9px] text-muted-foreground/70 tabular-nums">
                                {segDelta > 0 ? '+' : ''}{segDelta}▮
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                    {isThisUsing && <Loader2 className="size-3.5 animate-spin text-primary absolute top-2 right-2" />}
                  </button>
                );
              })}
              </div>
            </div>
          </div>
        ) : undefined}
        hero={
          isActiveFloatingCompanion && (
            <BlobbiRoomHero
              companion={companion}
              isUpdatingCompanion={isUpdatingCompanion}
              handleSetAsCompanion={handleSetAsCompanion}
            />
          )
        }
        stage={
          !isActiveFloatingCompanion ? (
            <BlobbiRoomStage
              companion={companion}
              currentStats={currentStats}
              isSleeping={isSleeping}
              statusRecipe={statusRecipe}
              statusRecipeLabel={statusRecipeLabel}
              effectiveEmotion={effectiveEmotion}
              hasDevOverride={hasDevOverride}
              blobbiReaction={blobbiReaction}
              interactionReaction={isEgg ? undefined : interactionReaction}
            />
          ) : undefined
        }
        middleSlot={
          <>
            {inlineActivity.type === 'music' && (
              <div className="px-4 sm:px-6 pb-2">
                <InlineMusicPlayer
                  selection={inlineActivity.selection}
                  onChangeTrack={handleChangeTrack}
                  onClose={handleCloseInlineActivity}
                  onPlaybackStart={handleMusicPlaybackStart}
                  onPlaybackStop={handleMusicPlaybackStop}
                  isPublished={inlineActivity.isPublished}
                  isPublishing={isDirectActionPending}
                />
              </div>
            )}
            {inlineActivity.type === 'sing' && (
              <div className="px-4 sm:px-6 pb-2">
                <InlineSingCard
                  onConfirm={handleConfirmSing}
                  onClose={handleCloseInlineActivity}
                  onRecordingStart={handleSingRecordingStart}
                  onRecordingStop={handleSingRecordingStop}
                  isPublishing={isDirectActionPending}
                />
              </div>
            )}
          </>
        }
      >
        {/* Per-room bottom bar */}
        {!isActiveFloatingCompanion && (
          <RoomBottomBar
            room={currentRoom}
            isEgg={isEgg}
            isSleeping={isSleeping}
            disabled={roomBusy}
            activeItemId={isUsingItem ? usingItemId : null}
            isResting={actionInProgress === 'rest'}
            isCurrentCompanion={isCurrentCompanion}
            canBeCompanion={canBeCompanion}
            isUpdatingCompanion={isUpdatingCompanion}
            handleSetAsCompanion={handleSetAsCompanion}
            applyItem={handleUseItemFromTab}
            feedItem={handleFeedItem}
            kitchenItems={kitchenItems}
            handleDirectAction={handleDirectAction}
            onRest={onRest}
            onPhoto={handlePhoto}
            onOpenFridge={() => setShowFridge(true)}
            shovel={
              <ShovelButton
                hasPoop={poops.length > 0}
                dragging={roomDrag.drag?.payload.kind === 'shovel'}
                onPointerDown={(e) => roomDrag.start(e, { kind: 'shovel' })}
                onClean={() => { if (poops[0]) cleanPoop(poops[0].id); }}
                glow={guideActionGlow === 'clean'}
              />
            }
            guideHighlightId={guideHighlightId}
            guideActionGlow={guideActionGlow}
            dragHandlers={itemDragHandlers}
            carouselKeyPrefix={`blobbi:carousel:${user?.pubkey ?? 'anon'}:${companion.d}`}
          />
        )}
      </BlobbiRoomShell>

      {/* ─── Drag ghost: an item or a visiting Blobbi under the finger ─── */}
      {roomDrag.drag && (
        <div
          ref={roomDrag.ghostRef}
          className="fixed pointer-events-none z-80"
          style={{
            display: 'none',
            left: roomDrag.drag.startX,
            top: roomDrag.drag.startY,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <DragGhost payload={roomDrag.drag.payload} companions={companions} />
        </div>
      )}

      {/* ─── Crumb burst overlay (chewing feedback) ─── */}
      {crumbBurst && (
        <CrumbBurst
          key={feedSeqRef.current}
          crumbX={crumbBurst.crumbX}
          crumbY={crumbBurst.crumbY}
          rewardX={crumbBurst.rewardX}
          rewardY={crumbBurst.rewardY}
        />
      )}
      
      {/* ─── Dialogs (only for things that genuinely need modals) ─── */}

      {/* Track Picker Modal */}
      <PlayMusicModal
        open={showTrackPickerModal}
        onOpenChange={setShowTrackPickerModal}
        onConfirm={handleTrackSelected}
        isLoading={isDirectActionPending}
      />
      
      {/* Blobbi Photo Modal */}
      <BlobbiPhotoModal
        open={showPhotoModal}
        onOpenChange={setShowPhotoModal}
        companion={companion}
      />


      {/* Hatch Ceremony — portaled to document.body to escape center column stacking context */}
      {showHatchCeremony && createPortal(
        <div className="fixed inset-0 z-100 bg-background">
          <BlobbiHatchingCeremony
            profile={profile}
            updateProfileEvent={updateProfileEvent}
            updateCompanionEvent={updateCompanionEvent}
            invalidateProfile={invalidateProfile}
            invalidateCompanion={invalidateCompanion}
            setStoredSelectedD={setStoredSelectedD}
            existingCompanion={companion}
            onComplete={() => setShowHatchCeremony(false)}
          />
        </div>,
        document.body,
      )}

      {/* Evolve Ceremony — portaled to document.body like the hatch ceremony */}
      {showEvolveCeremony && createPortal(
        <div className="fixed inset-0 z-100 bg-background">
          <BlobbiEvolveCeremony
            companion={companion}
            onEvolve={onEvolve}
            onComplete={() => setShowEvolveCeremony(false)}
          />
        </div>,
        document.body,
      )}

      {/* Adoption Flow Modal */}
      <Dialog open={showAdoptionFlow} onOpenChange={setShowAdoptionFlow}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-0">
          <BlobbiOnboardingFlow
            profile={profile}
            updateProfileEvent={updateProfileEvent}
            updateCompanionEvent={updateCompanionEvent}
            invalidateProfile={invalidateProfile}
            invalidateCompanion={invalidateCompanion}
            setStoredSelectedD={setStoredSelectedD}
            adoptionOnly={true}
            userInitiated={true}
            onComplete={() => setShowAdoptionFlow(false)}
          />
        </DialogContent>
      </Dialog>
      
      {/* DEV ONLY: State Editor */}
      {import.meta.env.DEV && (
        <BlobbiDevEditor
          isOpen={showDevEditor}
          onClose={() => setShowDevEditor(false)}
          companion={companion}
          onApply={onDevEditorApply}
          isUpdating={isDevUpdating}
          onResetDailyMissions={() => {
            dailyMissions.forceReset();
            window.dispatchEvent(new CustomEvent('daily-missions-updated', { detail: { devReset: true } }));
          }}
        />
      )}
      
      {/* DEV ONLY: Emotion Tester */}
      {import.meta.env.DEV && (
        <BlobbiEmotionPanel
          isOpen={showEmotionPanel}
          onClose={() => setShowEmotionPanel(false)}
        />
      )}
    </DashboardShell>
  );
}

// ─── Dragging items into the room ─────────────────────────────────────────────

/** Carousel drag handlers: any shop item can be dragged into the room. */
function useItemDragHandlers(roomDrag: RoomDrag | undefined) {
  return useMemo(() => roomDrag && {
    canDrag: (entry: CarouselEntry) => !!getShopItemById(entry.id),
    onPointerDown: (e: React.PointerEvent, entry: CarouselEntry) => {
      const item = getShopItemById(entry.id);
      if (item) roomDrag.start(e, { kind: 'item', itemId: item.id, emoji: item.icon });
    },
  }, [roomDrag]);
}

/** Distance (px) from the Blobbi's mouth that counts as feeding it. */
const MOUTH_RADIUS = 80;

function isNearMouth(x: number, y: number): boolean {
  const el = document.querySelector<HTMLElement>('[data-blobbi-visual]');
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height * 0.67)) <= MOUTH_RADIUS;
}

/** What's under the finger while dragging into the room. */
function DragGhost({ payload, companions }: { payload: RoomDragState['payload']; companions: BlobbiCompanion[] }) {
  if (payload.kind === 'item') return <span className="text-5xl drop-shadow-lg">{payload.emoji}</span>;
  if (payload.kind === 'shovel') return <ShovelGhost />;
  const companion = companions.find(c => c.d === payload.d);
  if (!companion) return null;
  return (
    <div className="size-24 drop-shadow-xl">
      <BlobbiStageVisual companion={companion} size="md" animated emotion="happy" className="size-full!" />
    </div>
  );
}

// ─── Room Bottom Bar ──────────────────────────────────────────────────────────

interface RoomBottomBarProps {
  room: BlobbiRoomId;
  isEgg: boolean;
  isSleeping: boolean;
  /** Something is in progress; the bar's actions wait for it. */
  disabled: boolean;
  /** The item being used, which shows a spinner. */
  activeItemId: string | null;
  isResting: boolean;
  isCurrentCompanion: boolean;
  canBeCompanion: boolean;
  isUpdatingCompanion: boolean;
  handleSetAsCompanion: () => Promise<void>;
  applyItem: (itemId: string) => void;
  /** Food, with the overfeed check. */
  feedItem: (itemId: string) => void;
  kitchenItems: CarouselEntry[];
  handleDirectAction: (action: DirectAction) => void;
  onRest: () => void;
  onPhoto: () => void;
  onOpenFridge: () => void;
  /** The kitchen's shovel. */
  shovel: React.ReactNode;
  /** Item ID to highlight in the carousel (guide flow). */
  guideHighlightId?: string | null;
  /** Action to glow (guide flow, e.g. 'sleep'). */
  guideActionGlow?: string | null;
  /** Drag items from the carousel into the room. */
  dragHandlers?: ReturnType<typeof useItemDragHandlers>;
  /** localStorage key prefix for carousel focus persistence (pubkey:blobbiD). */
  carouselKeyPrefix: string;
}

function RoomBottomBar(props: RoomBottomBarProps) {
  // A bed in any room can put the Blobbi to sleep, and rooms are locked while it
  // sleeps, so waking up has to be possible wherever it is
  if (props.isSleeping && !props.isEgg) return <RestBar {...props} />;
  switch (props.room) {
    case 'home': return <HomeBar {...props} />;
    case 'kitchen': return <KitchenBar {...props} />;
    case 'care': return <CareBar {...props} />;
    case 'rest': return <RestBar {...props} />;
    case 'closet': return <ClosetBar />;
  }
}

/** A bar's layout: a button each side (or an empty slot) and the carousel between. */
function BarLayout({ left, center, right }: { left?: React.ReactNode; center?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className={ROOM_BOTTOM_BAR_CLASS}>
      <div className="flex items-center justify-between gap-1 sm:gap-3">
        {left || <div className={ROOM_ACTION_SLOT} />}
        <div className="flex-1 min-w-0 flex justify-center">{center}</div>
        {right || <div className={ROOM_ACTION_SLOT} />}
      </div>
    </div>
  );
}

/** The item a room's carousel has focused, remembered per room and Blobbi. */
function useCarouselFocus(bar: RoomBottomBarProps) {
  return useLocalStorage<string | null>(`${bar.carouselKeyPrefix}:${bar.room}`, null);
}

function RoomCarousel({ bar, items, onUse, focus }: {
  bar: RoomBottomBarProps;
  items: CarouselEntry[];
  onUse: (id: string) => void;
  focus: ReturnType<typeof useCarouselFocus>;
}) {
  const [focusedId, setFocusedId] = focus;
  return (
    <ItemCarousel
      items={items}
      onUse={onUse}
      activeItemId={bar.activeItemId}
      disabled={bar.disabled}
      centerPointerHandlers={bar.dragHandlers}
      highlightId={bar.guideHighlightId}
      initialItemId={focusedId ?? undefined}
      onFocusChange={(entry) => setFocusedId(entry.id)}
    />
  );
}

// ── Home: toys + music/sing, photo left, companion right ──

const HOME_ACTION_LABELS = defineMessages({
  music: { id: 'blobbiRoom.dock.music', defaultMessage: 'Music' },
  sing: { id: 'blobbiRoom.dock.sing', defaultMessage: 'Sing' },
});

const HOME_ACTIONS = [
  {
    id: '__action_music',
    icon: <div className="size-[1em] rounded-full flex items-center justify-center bg-pink-500/15 text-pink-500"><Music className="size-[0.5em]" /></div>,
    label: HOME_ACTION_LABELS.music,
  },
  {
    id: '__action_sing',
    icon: <div className="size-[1em] rounded-full flex items-center justify-center bg-purple-500/15 text-purple-500"><Mic className="size-[0.5em]" /></div>,
    label: HOME_ACTION_LABELS.sing,
  },
];

function HomeBar(props: RoomBottomBarProps) {
  const { isCurrentCompanion, canBeCompanion, isUpdatingCompanion, handleSetAsCompanion, applyItem, handleDirectAction, onPhoto } = props;
  const intl = useIntl();
  const focus = useCarouselFocus(props);
  const items = useMemo<CarouselEntry[]>(() => [
    ...getLiveShopItems().filter(i => i.type === 'toy').map(i => ({ id: i.id, icon: <span>{i.icon}</span>, label: i.name })),
    ...HOME_ACTIONS.map(a => ({ ...a, label: intl.formatMessage(a.label) })),
  ], [intl]);

  const handleUse = useCallback((id: string) => {
    if (id === '__action_music') handleDirectAction('play_music');
    else if (id === '__action_sing') handleDirectAction('sing');
    else applyItem(id);
  }, [handleDirectAction, applyItem]);

  return (
    <BarLayout
      left={<RoomActionButton icon={<Camera />} label={intl.formatMessage({ id: 'blobbiRoom.dock.photo', defaultMessage: 'Photo' })} color="text-pink-500" glowHex="#ec4899" onClick={onPhoto} />}
      center={<RoomCarousel bar={props} items={items} onUse={handleUse} focus={focus} />}
      right={canBeCompanion && (
        <RoomActionButton
          icon={<Footprints />}
          label={isCurrentCompanion
            ? intl.formatMessage({ id: 'blobbiRoom.dock.withYou', defaultMessage: 'With you' })
            : intl.formatMessage({ id: 'blobbiRoom.dock.takeAlong', defaultMessage: 'Take along' })}
          color={isCurrentCompanion ? 'text-emerald-500' : 'text-violet-500'}
          glowHex={isCurrentCompanion ? '#10b981' : '#8b5cf6'}
          onClick={handleSetAsCompanion}
          disabled={isUpdatingCompanion}
          loading={isUpdatingCompanion}
        />
      )}
    />
  );
}

// ── Kitchen: food carousel, shovel left, fridge right ──

/** Lucide icon for each stat key */
const STAT_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  hunger: Utensils,
  happiness: Gamepad2,
  health: Heart,
  hygiene: Droplets,
  energy: Zap,
};

function KitchenBar(props: RoomBottomBarProps) {
  const intl = useIntl();
  const focus = useCarouselFocus(props);
  return (
    <BarLayout
      left={props.shovel}
      center={<RoomCarousel bar={props} items={props.kitchenItems} onUse={props.feedItem} focus={focus} />}
      right={
        <RoomActionButton
          icon={<Refrigerator />}
          label={intl.formatMessage({ id: 'blobbiRoom.dock.fridge', defaultMessage: 'Fridge' })}
          color="text-orange-500"
          glowHex="#f97316"
          onClick={props.onOpenFridge}
          disabled={props.disabled}
        />
      }
    />
  );
}

// ── Care: hygiene + medicine carousel, context-sensitive side buttons ──

function CareBar(props: RoomBottomBarProps) {
  const { disabled, activeItemId, applyItem } = props;
  const intl = useIntl();
  const shop = useMemo(() => getLiveShopItems(), []);
  const items = useMemo<CarouselEntry[]>(() => [
    ...shop.filter(i => i.type === 'hygiene' && i.id !== 'hyg_towel').map(i => ({ id: i.id, icon: <span>{i.icon}</span>, label: i.name, meta: 'hygiene' })),
    ...shop.filter(i => i.type === 'medicine').map(i => ({ id: i.id, icon: <span>{i.icon}</span>, label: i.name, meta: 'medicine' })),
  ], [shop]);
  const focus = useCarouselFocus(props);
  const focused = items.find(e => e.id === focus[0]) ?? items[0];
  const isHygieneFocused = (focused?.meta ?? 'hygiene') === 'hygiene';
  const towel = shop.find(i => i.id === 'hyg_towel');
  const treat = shop.find(i => i.type === 'food');
  const shampoo = shop.find(i => i.id === 'hyg_shampoo');

  return (
    <BarLayout
      left={isHygieneFocused ? towel && (
        <RoomActionButton
          icon={<TowelRack />}
          label={intl.formatMessage({ id: 'blobbiRoom.dock.towel', defaultMessage: 'Towel' })}
          color="text-cyan-500"
          glowHex="#06b6d4"
          onClick={() => applyItem(towel.id)}
          disabled={disabled}
          loading={activeItemId === towel.id}
        />
      ) : treat && (
        <RoomActionButton
          icon={<Candy />}
          label={treat.name}
          color="text-pink-400"
          glowHex="#f472b6"
          onClick={() => applyItem(treat.id)}
          disabled={disabled}
        />
      )}
      center={<RoomCarousel bar={props} items={items} onUse={applyItem} focus={focus} />}
      right={isHygieneFocused && shampoo && (
        <RoomActionButton
          icon={<ShowerHead />}
          label={intl.formatMessage({ id: 'blobbiRoom.dock.shower', defaultMessage: 'Shower' })}
          color="text-blue-500"
          glowHex="#3b82f6"
          onClick={() => applyItem(shampoo.id)}
          disabled={disabled}
        />
      )}
    />
  );
}

// ── Rest: sleep/wake button centered ──

function RestBar({ isEgg, isSleeping, onRest, disabled, isResting, guideActionGlow }: RoomBottomBarProps) {
  const intl = useIntl();
  return (
    <BarLayout
      center={!isEgg && (
        <RoomActionButton
          icon={isSleeping ? <Sun /> : <Moon />}
          label={isSleeping
            ? intl.formatMessage({ id: 'blobbiRoom.dock.wakeUp', defaultMessage: 'Wake up' })
            : intl.formatMessage({ id: 'blobbiRoom.dock.sleep', defaultMessage: 'Sleep' })}
          color={isSleeping ? 'text-amber-500' : 'text-violet-500'}
          glowHex={isSleeping ? '#f59e0b' : '#8b5cf6'}
          onClick={onRest}
          disabled={disabled}
          loading={isResting}
          glow={guideActionGlow === 'sleep'}
        />
      )}
    />
  );
}

// ── Closet: placeholder ──

function ClosetBar() {
  return (
    <div className={ROOM_BOTTOM_BAR_CLASS}>
      <div className="flex items-center justify-center gap-2 py-1">
        <p className="text-xs text-muted-foreground/40 font-medium">
          <FormattedMessage id="blobbiRoom.dock.closetSoon" defaultMessage="Closet coming soon" />
        </p>
      </div>
    </div>
  );
}

// ─── Missions Tab Content ─────────────────────────────────────────────────────

interface MissionsTabContentProps {
  isIncubating: boolean;
  isEvolvingState: boolean;
  isEgg: boolean;
  isBaby: boolean;
  hatchTasks: ReturnType<typeof useHatchTasks>;
  evolveTasks: ReturnType<typeof useEvolveTasks>;
  onHatch: () => Promise<void>;
  isHatching: boolean;
  onEvolve: () => Promise<void>;
  isEvolving: boolean;
  onStopIncubation: () => Promise<void>;
  isStoppingIncubation: boolean;
  onStopEvolution: () => Promise<void>;
  isStoppingEvolution: boolean;
  dailyMissions: ReturnType<typeof useDailyMissions>;
  canStartIncubation: boolean;
  canStartEvolution: boolean;
  isStartingIncubation: boolean;
  isStartingEvolution: boolean;
  onStartIncubation: () => void;
  onStartEvolution: () => void;
}

type QuestPane = 'journey' | 'bounties';

function MissionsTabContent({
  isIncubating,
  isEvolvingState,
  isEgg,
  isBaby,
  hatchTasks,
  evolveTasks,
  onHatch,
  isHatching,
  onEvolve,
  isEvolving,
  onStopIncubation,
  isStoppingIncubation,
  onStopEvolution,
  isStoppingEvolution,
  dailyMissions,
  canStartIncubation,
  canStartEvolution,
  isStartingIncubation,
  isStartingEvolution,
  onStartIncubation,
  onStartEvolution,
}: MissionsTabContentProps) {
  const [pane, setPane] = useState<QuestPane>('journey');
  const hasActiveProcess = (isIncubating && isEgg) || (isEvolvingState && isBaby);
  const isProcessBusy = isHatching || isEvolving || isStoppingIncubation || isStoppingEvolution;
  const tasks = isIncubating ? hatchTasks.tasks : evolveTasks.tasks;
  const allCompleted = isIncubating ? hatchTasks.allCompleted : evolveTasks.allCompleted;
  const isLoading = isIncubating ? hatchTasks.isLoading : evolveTasks.isLoading;
  const navigate = useNavigate();

  const completedCount = tasks.filter(t => t.completed).length;
  const totalCount = tasks.length;

  const { missions } = dailyMissions;
  const dailyCompleted = missions.filter(m => m.complete).length;
  const dailyTotal = missions.length;

  return (
    <div className="flex flex-col h-full px-3 sm:px-4">
      {/* ── Pill toggle ── */}
      <div className="flex justify-center py-2">
        <div className="inline-flex rounded-full bg-muted/50 p-1 gap-0.5">
          <button
            onClick={() => setPane('journey')}
            className={cn(
              'flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200',
              pane === 'journey'
                ? 'bg-background shadow-xs text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Egg className="size-3.5" />
            Journey
            {hasActiveProcess && (
              <span className="text-[10px] tabular-nums text-muted-foreground">{completedCount}/{totalCount}</span>
            )}
          </button>
          <button
            onClick={() => setPane('bounties')}
            className={cn(
              'flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200',
              pane === 'bounties'
                ? 'bg-background shadow-xs text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Target className="size-3.5" />
            Bounties
            {dailyTotal > 0 && (
              <span className="text-[10px] tabular-nums text-muted-foreground">{dailyCompleted}/{dailyTotal}</span>
            )}
          </button>
        </div>
      </div>

      {/* ── Content area ── */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-1">
        {pane === 'journey' && (
          <>
            {/* Loading */}
            {isLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Active task rows */}
            {hasActiveProcess && !isLoading && tasks.map(task => {
              const handleAction = () => {
                if (!task.action || !task.actionTarget) return;
                switch (task.action) {
                  case 'navigate': navigate(task.actionTarget); break;
                   case 'external_link': openUrl(task.actionTarget); break;
                }
              };
              const isActionable = !task.completed && !!task.action && !!task.actionTarget;
              return (
                <button
                  key={task.id}
                  onClick={isActionable ? handleAction : undefined}
                  disabled={!isActionable}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all text-left',
                    isActionable && 'hover:bg-accent/50 active:scale-[0.98] cursor-pointer',
                    !isActionable && 'cursor-default',
                  )}
                >
                  <QuestTaskIcon taskId={task.id} completed={task.completed} />
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-sm font-medium leading-tight', task.completed && 'text-muted-foreground line-through')}>{task.name}</p>
                    <p className="text-[10px] text-muted-foreground leading-snug mt-0.5 line-clamp-1">{task.description}</p>
                  </div>
                  {task.required > 1 && !task.completed && (
                    <span className="text-[10px] tabular-nums font-medium text-muted-foreground shrink-0">{task.current}/{task.required}</span>
                  )}
                </button>
              );
            })}

            {/* Hatch / Evolve CTA */}
            {hasActiveProcess && allCompleted && !isLoading && (
              <button
                onClick={isIncubating ? onHatch : onEvolve}
                disabled={isProcessBusy}
                className={cn(
                  'w-full flex items-center justify-center gap-2 px-6 py-3 mt-1 rounded-full text-white font-semibold transition-all duration-300',
                  'hover:-translate-y-0.5 hover:scale-105 hover:brightness-110 active:scale-95',
                  isProcessBusy && 'opacity-50 pointer-events-none',
                )}
                style={{
                  background: isIncubating
                    ? 'linear-gradient(135deg, #0ea5e9, #8b5cf6)'
                    : 'linear-gradient(135deg, #8b5cf6, #ec4899)',
                }}
              >
                {(isHatching || isEvolving) ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <span className="text-lg">{isIncubating ? '\uD83D\uDC23' : '\u2728'}</span>
                )}
                <span>{(isHatching || isEvolving) ? (isIncubating ? 'Hatching...' : 'Evolving...') : (isIncubating ? 'Hatch!' : 'Evolve!')}</span>
              </button>
            )}

            {/* Stop process */}
            {hasActiveProcess && !isLoading && (
              <button
                onClick={isIncubating ? onStopIncubation : onStopEvolution}
                disabled={isProcessBusy}
                className="w-full text-center text-[11px] text-muted-foreground/40 hover:text-destructive/60 transition-colors pt-1"
              >
                {(isStoppingIncubation || isStoppingEvolution) ? 'Stopping...' : `Stop ${isIncubating ? 'incubation' : 'evolution'}`}
              </button>
            )}

            {/* No active process */}
            {!hasActiveProcess && !isLoading && (
              <div className="flex flex-col items-center gap-3 py-4">
                {(canStartIncubation || canStartEvolution) ? (
                  <button
                    onClick={canStartIncubation ? onStartIncubation : onStartEvolution}
                    disabled={isStartingIncubation || isStartingEvolution}
                    className={cn(
                      'flex items-center justify-center gap-2 px-8 py-3 rounded-full text-white font-semibold transition-all duration-300',
                      'hover:-translate-y-0.5 hover:scale-105 hover:brightness-110 active:scale-95',
                      (isStartingIncubation || isStartingEvolution) && 'opacity-50 pointer-events-none',
                    )}
                    style={{
                      background: canStartIncubation
                        ? 'linear-gradient(135deg, #0ea5e9, #8b5cf6)'
                        : 'linear-gradient(135deg, #8b5cf6, #ec4899)',
                    }}
                  >
                    {(isStartingIncubation || isStartingEvolution) ? (
                      <Loader2 className="size-5 animate-spin" />
                    ) : (
                      <Sparkles className="size-5" />
                    )}
                    <span>{canStartIncubation ? 'Begin Hatching' : 'Begin Evolution'}</span>
                  </button>
                ) : (
                  <p className="text-xs text-muted-foreground/50">No journey available right now</p>
                )}
              </div>
            )}
          </>
        )}

        {pane === 'bounties' && (
          <>
            {dailyMissions.isLoading && (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <p className="text-xs text-muted-foreground/50">Loading daily bounties...</p>
              </div>
            )}

            {!dailyMissions.isLoading && dailyMissions.noMissionsAvailable && (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <Egg className="size-6 text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground">Hatch your Blobbi to unlock daily bounties</p>
              </div>
            )}

            {!dailyMissions.noMissionsAvailable && !dailyMissions.isLoading && missions.map(mission => (
              <div
                key={mission.id}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all',
                  mission.complete && 'bg-emerald-500/6',
                )}
              >
                <DailyMissionIcon action={mission.action} complete={mission.complete} />
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm font-medium leading-tight', mission.complete && 'text-muted-foreground')}>{mission.title}</p>
                  <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">{mission.description}</p>
                </div>
                {!mission.complete && (
                  <span className="text-[10px] tabular-nums font-medium text-muted-foreground shrink-0">{mission.progress}/{mission.target}</span>
                )}
                {mission.complete && (
                  <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 shrink-0">+{mission.xp} XP</span>
                )}
              </div>
            ))}

            {/* Bonus row */}
            {!dailyMissions.noMissionsAvailable && !dailyMissions.isLoading && dailyMissions.bonusUnlocked && (
              <div className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-violet-500/6">
                <div className="size-8 rounded-full bg-violet-500/15 flex items-center justify-center shrink-0">
                  <Sparkles className="size-4 text-violet-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-tight">Daily Champion</p>
                  <p className="text-[10px] text-muted-foreground">All missions complete!</p>
                </div>
                <span className="text-[10px] font-medium text-violet-600 dark:text-violet-400 shrink-0">+{dailyMissions.bonusXp} XP</span>
              </div>
            )}

            {!dailyMissions.noMissionsAvailable && !dailyMissions.isLoading && dailyCompleted === dailyTotal && dailyTotal > 0 && dailyMissions.allComplete && (
              <div className="flex flex-col items-center gap-1 py-4 text-center">
                <Sparkles className="size-5 text-primary/40" />
                <p className="text-xs text-muted-foreground">All done for today — come back tomorrow!</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Quest task icon ──────────────────────────────────────────────────────────

function QuestTaskIcon({ taskId, completed }: { taskId: string; completed: boolean }) {
  const iconClass = 'size-4';
  const icon = (() => {
    switch (taskId) {
      case 'create_themes': return <Sparkles className={iconClass} />;
      case 'color_moments': return <Droplets className={iconClass} />;
      case 'create_posts': return <Target className={iconClass} />;
      case 'interactions': return <Heart className={iconClass} />;
      case 'edit_profile': return <Wrench className={iconClass} />;
      case 'maintain_stats': return <Zap className={iconClass} />;
      default: return <Target className={iconClass} />;
    }
  })();
  return (
    <div className={cn(
      'size-8 rounded-full flex items-center justify-center shrink-0',
      completed ? 'bg-emerald-500/15 text-emerald-500' : 'bg-muted/60 text-muted-foreground',
    )}>
      {completed ? <Check className="size-4" /> : icon}
    </div>
  );
}

// ─── Daily mission icon ───────────────────────────────────────────────────────

function DailyMissionIcon({ action, complete }: { action: string; complete: boolean }) {
  const iconClass = 'size-4';
  const icon = (() => {
    switch (action) {
      case 'interact': return <Heart className={iconClass} />;
      case 'feed': return <Utensils className={iconClass} />;
      case 'clean': return <Droplets className={iconClass} />;
      case 'sleep': return <Moon className={iconClass} />;
      case 'take_photo': return <Camera className={iconClass} />;
      case 'sing': return <Mic className={iconClass} />;
      case 'play_music': return <Music className={iconClass} />;
      case 'medicine': return <Pill className={iconClass} />;
      default: return <Target className={iconClass} />;
    }
  })();
  return (
    <div className={cn(
      'size-8 rounded-full flex items-center justify-center shrink-0',
      complete ? 'bg-emerald-500/15 text-emerald-500' : 'bg-muted/60 text-muted-foreground',
    )}>
      {complete ? <Check className="size-4" /> : icon}
    </div>
  );
}

// ─── More Tab Content ─────────────────────────────────────────────────────────

interface MoreTabContentProps {
  companion: BlobbiCompanion;
  companions: BlobbiCompanion[];
  selectedD: string;
  profile: BlobbonautProfile | null;
  blobbiNaddr: string;
  onSelectBlobbi: (d: string) => void;
  onAdopt: () => void;
  onDevOpenEditor: () => void;
  onDevOpenEmotionPanel: () => void;
  onDevInstantTransition?: () => void;
  isHatching: boolean;
  isEvolving: boolean;
  /** Invite other Blobbis into the current room. */
  guestPicker?: React.ReactNode;
}

function MoreTabContent({
  companion,
  companions,
  selectedD,
  profile,
  blobbiNaddr,
  onSelectBlobbi,
  onAdopt,
  onDevOpenEditor,
  onDevOpenEmotionPanel,
  onDevInstantTransition,
  isHatching,
  isEvolving,
  guestPicker,
}: MoreTabContentProps) {
  const isTransitioning = isHatching || isEvolving;

  return (
    <div className="flex flex-col items-center h-full min-h-[210px] px-3 sm:px-4">
      {guestPicker}

      {/* ── Blobbi grid ── */}
      <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 py-3">
        {companions.map((c) => {
          const isSelected = c.d === selectedD;
          const isCompanion = c.d === profile?.currentCompanion;
          return (
            <button
              key={c.d}
              onClick={() => onSelectBlobbi(c.d)}
              className={cn(
                'flex flex-col items-center gap-1 transition-all duration-200',
                'hover:-translate-y-1 hover:scale-105 active:scale-95',
              )}
            >
              <div className="relative">
                <div className={cn(
                  'rounded-full p-1 transition-all',
                  isSelected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : '',
                )}>
                  <BlobbiStageVisual
                    companion={c}
                    size="sm"
                    recipe={c.state === 'sleeping' ? buildSleepingRecipe() : undefined}
                    recipeLabel={c.state === 'sleeping' ? 'sleeping' : undefined}
                  />
                </div>
                {isCompanion && (
                  <div className="absolute -bottom-0.5 -right-0.5 size-5 rounded-full bg-background ring-2 ring-background flex items-center justify-center">
                    <Footprints className="size-3 text-emerald-500" />
                  </div>
                )}
                {companionNeedsCare(c) && !isCompanion && (
                  <div className="absolute -top-0.5 -right-0.5 size-4 rounded-full bg-amber-500 flex items-center justify-center">
                    <span className="text-[8px] text-white font-bold">!</span>
                  </div>
                )}
              </div>
              {c.stage !== 'egg' && (
                <span className={cn(
                  'text-[11px] font-medium max-w-18 truncate',
                  isSelected ? 'text-foreground' : 'text-muted-foreground',
                )}>
                  {c.name}
                </span>
              )}
            </button>
          );
        })}

        {/* Adopt + button */}
        <button
          onClick={onAdopt}
          className="flex flex-col items-center gap-1 transition-all duration-200 hover:-translate-y-1 hover:scale-105 active:scale-95"
        >
          <div className="size-14 rounded-full flex items-center justify-center" style={{
            background: 'radial-gradient(circle at 40% 35%, color-mix(in srgb, currentColor 10%, transparent), color-mix(in srgb, currentColor 3%, transparent) 70%)',
          }}>
            <Plus className="size-6 text-muted-foreground/60" />
          </div>
          <span className="text-[11px] font-medium text-muted-foreground/60">Adopt</span>
        </button>
      </div>

      {/* ── Quick actions row ── */}
      <div className="flex items-center justify-center gap-6 pt-1">
        <Link to={`/${blobbiNaddr}`} className="flex flex-col items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
          <ExternalLink className="size-5" />
          <span className="text-[10px]">View</span>
        </Link>
        {/* DEV tools */}
        {isLocalhostDev() && (
          <>
            {companion.stage !== 'adult' && onDevInstantTransition && (
              <button onClick={onDevInstantTransition} disabled={isTransitioning} className="flex flex-col items-center gap-1 text-amber-500 hover:text-amber-400 transition-colors disabled:opacity-40">
                <Sparkles className="size-5" />
                <span className="text-[10px]">{companion.stage === 'egg' ? 'Hatch' : 'Evolve'}</span>
              </button>
            )}
            <button onClick={onDevOpenEditor} className="flex flex-col items-center gap-1 text-amber-500 hover:text-amber-400 transition-colors">
              <Wrench className="size-5" />
              <span className="text-[10px]">Editor</span>
            </button>
            <button onClick={onDevOpenEmotionPanel} className="flex flex-col items-center gap-1 text-amber-500 hover:text-amber-400 transition-colors">
              <Theater className="size-5" />
              <span className="text-[10px]">Emote</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}


// ─── Needs Tab Content ────────────────────────────────────────────────────────

/** Action label + emoji for display in the activity list */
const INTERACTION_ACTION_DISPLAY: Record<string, { label: string; icon: string }> = {
  feed: { label: 'Feed', icon: '🍎' },
  play: { label: 'Play', icon: '⚽' },
  clean: { label: 'Clean', icon: '🧼' },
  medicate: { label: 'Medicine', icon: '💊' },
  boost: { label: 'Boost', icon: '⚡' },
};

/** Stat label + icon for the needs summary */
const STAT_DISPLAY: Record<string, { label: string; icon: string }> = {
  hunger: { label: 'Hungry', icon: '🍎' },
  happiness: { label: 'Unhappy', icon: '⚽' },
  hygiene: { label: 'Dirty', icon: '🧼' },
  health: { label: 'Unwell', icon: '💊' },
  energy: { label: 'Tired', icon: '⚡' },
};

interface ActivityTabContentProps {
  companion: BlobbiCompanion;
  projectedStats: BlobbiStats;
  socialOpen: boolean;
  onToggleSocial: (open: boolean) => Promise<void>;
  isSocialToggling: boolean;
  isEgg: boolean;
}

function ActivityTabContent({ companion, projectedStats, socialOpen, onToggleSocial, isSocialToggling, isEgg }: ActivityTabContentProps) {
  // Fetch recent unconsolidated interactions for the "Recent help" section.
  const { interactions: recentHelp, isLoading } = useBlobbiActivityHistory(isEgg ? null : companion);

  // Compute current needs from projected stats.
  const needs = useMemo(() => getAllNeeds(projectedStats), [projectedStats]);

  const socialToggleId = 'blobbi-social-toggle';

  return (
    <div className="px-4 sm:px-6 space-y-4">
      {/* ─── Needs Now Summary ─── */}
      {!isEgg && (
        <div>
          {needs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              All good! No needs right now.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Needs now
              </p>
              <div className="flex flex-wrap gap-1.5">
                {needs.map(({ stat, priority }) => {
                  const info = STAT_DISPLAY[stat] ?? { label: stat, icon: '?' };
                  return (
                    <span
                      key={stat}
                      className={cn(
                        'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium',
                        priority === 'critical' && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                        priority === 'high' && 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
                        priority === 'normal' && 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
                        priority === 'low' && 'bg-muted text-muted-foreground',
                      )}
                    >
                      <span>{info.icon}</span>
                      <span>{info.label}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Social Permission Toggle (hidden for eggs) ─── */}
      {isEgg ? (
        <div className="flex items-center gap-2.5 border-t border-border/50 pt-4">
          <Egg className="size-4 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Social care settings will unlock after your Blobbi hatches.
          </p>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 border-t border-border/50 pt-4">
          <label htmlFor={socialToggleId} className="flex items-center gap-2.5 cursor-pointer select-none min-w-0">
            <Users className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-sm font-medium leading-tight">Allow others to care for this Blobbi</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {socialOpen ? 'Anyone can feed, play, and clean.' : 'Only you can interact.'}
              </p>
            </div>
          </label>
          <Switch
            id={socialToggleId}
            checked={socialOpen}
            onCheckedChange={onToggleSocial}
            disabled={isSocialToggling}
            aria-label="Allow other people to care for this Blobbi"
          />
        </div>
      )}

      {/* ─── Recent Help ─── */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded-lg" />
          ))}
        </div>
      ) : recentHelp.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <Heart className="size-6 mb-2 opacity-40" />
          <p className="text-sm">No recent help</p>
        </div>
      ) : (
        <>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide border-t border-border/50 pt-4">Recent help</p>
          <div className="divide-y divide-border/40 max-h-60 overflow-y-auto">
            {recentHelp.map((ix) => {
              const actionInfo = INTERACTION_ACTION_DISPLAY[ix.action] ?? { label: ix.action, icon: '?' };
              const item = ix.itemId ? getShopItemById(ix.itemId) : undefined;

              return (
                <div
                  key={ix.event.id}
                  className="flex items-center gap-2 py-2 text-sm"
                >
                  <span className="text-base leading-none">{actionInfo.icon}</span>
                  <span className="font-medium">{actionInfo.label}</span>
                  {item && (
                    <span className="text-muted-foreground truncate max-w-28">
                      {item.icon} {item.name}
                    </span>
                  )}
                  <span className="ml-auto flex items-center gap-1.5 shrink-0 text-xs text-muted-foreground">
                    <CaretakerLink pubkey={ix.authorPubkey} />
                    <span>{timeAgo(ix.createdAt)}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/** Small inline component to resolve + link a caretaker's display name. */
function CaretakerLink({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const displayName = author.data?.metadata?.name ?? 'Anonymous';
  const profilePath = getProfileUrl(pubkey, author.data?.metadata);

  return (
    <Link
      to={profilePath}
      className="font-medium text-foreground hover:underline truncate max-w-24"
      title={displayName}
      onClick={(e) => e.stopPropagation()}
    >
      {displayName}
    </Link>
  );
}

// ─── Blobbi Selector Page ─────────────────────────────────────────────────────

interface BlobbiSelectorPageProps {
  companions: BlobbiCompanion[];
  onSelect: (d: string) => void;
  isLoading?: boolean;
  onAdopt?: () => void;
  currentCompanion?: string;
}

function BlobbiSelectorPage({ companions, onSelect, isLoading, onAdopt, currentCompanion }: BlobbiSelectorPageProps) {
  return (
    <DashboardShell>
      <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center gap-3">
          <Egg className="size-5 text-primary" />
          <div>
            <h1 className="text-lg font-semibold">Choose Your Blobbi</h1>
            <p className="text-xs text-muted-foreground">Select a companion to care for</p>
          </div>
        </div>
        {isLoading && <RefreshCw className="size-4 text-muted-foreground animate-spin" />}
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-6">
        <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-8">
          {companions.map((c) => {
            const isCompanion = c.d === currentCompanion;
            return (
              <button
                key={c.d}
                onClick={() => onSelect(c.d)}
                className="flex flex-col items-center gap-1.5 transition-all duration-200 hover:-translate-y-1 hover:scale-105 active:scale-95"
              >
                <div className="relative">
                  <BlobbiStageVisual companion={c} size="sm" />
                  {isCompanion && (
                    <div className="absolute -bottom-0.5 -right-0.5 size-5 rounded-full bg-background ring-2 ring-background flex items-center justify-center">
                      <Footprints className="size-3 text-emerald-500" />
                    </div>
                  )}
                </div>
                <span className="text-xs font-medium text-muted-foreground max-w-20 truncate">{c.name}</span>
              </button>
            );
          })}
          {onAdopt && (
            <button
              onClick={onAdopt}
              className="flex flex-col items-center gap-1.5 transition-all duration-200 hover:-translate-y-1 hover:scale-105 active:scale-95"
            >
              <div className="size-14 rounded-full flex items-center justify-center" style={{
                background: 'radial-gradient(circle at 40% 35%, color-mix(in srgb, currentColor 10%, transparent), color-mix(in srgb, currentColor 3%, transparent) 70%)',
              }}>
                <Plus className="size-6 text-muted-foreground/60" />
              </div>
              <span className="text-xs font-medium text-muted-foreground/60">Adopt</span>
            </button>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}



// ─── Dashboard Loading State ──────────────────────────────────────────────────

function DashboardLoadingState() {
  return (
    <DashboardShell>
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-4">
        <Skeleton className="h-8 w-32 mb-6" />
        <Skeleton className="size-80 sm:size-96 md:size-112 rounded-full" />
      </div>
      <div className="px-4 pb-6 sm:px-6">
        <div className="flex justify-center gap-4 sm:gap-6">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <Skeleton className="size-14 sm:size-16 rounded-full" />
              <Skeleton className="h-3 w-10" />
            </div>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}

// ─── Crumb Burst (chewing feedback particles) ────────────────────────────────

/** Reward words — one is picked at random on each feed. */
const REWARD_WORDS = [
  'nhom!', 'nom nom!', 'yum!', 'yum yum!', 'mmm~',
  'munch!', 'cronch!', 'tasty!', 'hehe!', '\u2661',
] as const;

/**
 * Crumb particle configs — 12 small dots that spawn from a compact
 * mouth-shaped strip and tumble mostly downward.
 *
 * `sx`/`sy` — spawn offset from the mouth center (mouth ~16 px wide).
 * `dx`/`dy` — drift from the spawn point during the fall animation.
 * `delay`   — staggered start for a natural feel.
 * `size`    — 2–4 px (small crumbs with a few medium ones).
 * `color`   — warm food-like Tailwind colour class.
 */
const CRUMB_PARTICLES: ReadonlyArray<{
  sx: number; sy: number; dx: number; dy: number;
  delay: number; size: number; color: string;
}> = [
  // left side of mouth
  { sx: -7, sy:  0, dx: -4, dy: 14, delay:   0, size: 2, color: 'bg-amber-600/90' },
  { sx: -5, sy:  1, dx: -2, dy: 18, delay:  50, size: 3, color: 'bg-orange-500/85' },
  { sx: -8, sy: -1, dx: -5, dy: 12, delay: 100, size: 2, color: 'bg-yellow-600/80' },
  // center of mouth
  { sx: -2, sy:  2, dx:  1, dy: 20, delay:  30, size: 3, color: 'bg-amber-700/90' },
  { sx:  1, sy:  3, dx: -1, dy: 24, delay:  80, size: 4, color: 'bg-orange-600/85' },
  { sx:  0, sy:  2, dx:  2, dy: 16, delay: 120, size: 2, color: 'bg-amber-500/90' },
  // right side of mouth
  { sx:  5, sy:  1, dx:  3, dy: 18, delay:  40, size: 3, color: 'bg-amber-600/80' },
  { sx:  7, sy:  0, dx:  5, dy: 14, delay:  90, size: 2, color: 'bg-yellow-700/80' },
  { sx:  8, sy: -1, dx:  4, dy: 12, delay: 130, size: 2, color: 'bg-orange-500/75' },
  // a few extra that fall a bit further for depth
  { sx: -3, sy:  2, dx: -3, dy: 26, delay:  60, size: 4, color: 'bg-amber-700/80' },
  { sx:  3, sy:  2, dx:  2, dy: 28, delay: 110, size: 3, color: 'bg-yellow-600/75' },
  { sx:  0, sy:  3, dx:  0, dy: 22, delay: 140, size: 2, color: 'bg-orange-600/80' },
];

/**
 * Burst of crumb particles + a tiny floating reward word.
 *
 * Crumbs are anchored at (crumbX, crumbY) — just below the mouth — and
 * fall outward via the `crumb-fall` CSS animation.
 *
 * The reward word is anchored at (rewardX, rewardY) — above the head —
 * and floats upward via `reward-pop`.
 *
 * Both layers are pointer-events-none and aria-hidden; purely decorative.
 */
function CrumbBurst({ crumbX, crumbY, rewardX, rewardY }: {
  crumbX: number; crumbY: number;
  rewardX: number; rewardY: number;
}) {
  // Pick a stable random word for this burst instance.
  const [word] = useState(() => REWARD_WORDS[Math.floor(Math.random() * REWARD_WORDS.length)]);

  return (
    <>
      {/* Crumb particles — anchored just below the mouth */}
      <div
        className="fixed pointer-events-none z-60"
        style={{ left: crumbX, top: crumbY }}
        aria-hidden="true"
      >
        {CRUMB_PARTICLES.map((p, i) => (
          <span
            key={i}
            className={`absolute rounded-full ${p.color} animate-crumb-fall`}
            style={{
              left: p.sx,
              top: p.sy,
              width: p.size,
              height: p.size,
              animationDelay: `${p.delay}ms`,
              '--crumb-dx': `${p.dx}px`,
              '--crumb-dy': `${p.dy}px`,
            } as React.CSSProperties}
          />
        ))}
      </div>

      {/* Floating reward word — anchored above the head */}
      <span
        className="fixed pointer-events-none z-60 text-xs font-bold text-amber-500 drop-shadow-[0_1px_2px_rgba(180,83,9,0.4)] animate-reward-pop whitespace-nowrap select-none"
        style={{ left: rewardX, top: rewardY, transform: 'translate(-50%, 0)' }}
        aria-hidden="true"
      >
        {word}
      </span>
    </>
  );
}

// ─── Hatch Ceremony Overlay ───────────────────────────────────────────────────


