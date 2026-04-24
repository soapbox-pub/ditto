import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { nip19 } from 'nostr-tools';
import { Egg, Moon, Sun, RefreshCw, Check, Plus, Camera, Footprints, Wrench, Theater, ExternalLink, Utensils, Gamepad2, Sparkles, Pill, Music, Mic, Loader2, Target, Droplets, Heart, Zap, Refrigerator, ShowerHead, Candy, Shovel, TowelRack, X } from 'lucide-react';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useProjectedBlobbiState } from '@/blobbi/core/hooks/useProjectedBlobbiState';
import { useAppContext } from '@/hooks/useAppContext';
import { useBlobbonautProfile } from '@/hooks/useBlobbonautProfile';
import { useBlobbonautProfileNormalization } from '@/hooks/useBlobbonautProfileNormalization';
import { useBlobbisCollection } from '@/blobbi/core/hooks/useBlobbisCollection';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useBlobbiMigration } from '@/blobbi/core/hooks/useBlobbiMigration';
import { toast } from '@/hooks/useToast';

import { LoginArea } from '@/components/auth/LoginArea';
import { Button } from '@/components/ui/button';

import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { SubHeaderBar } from '@/components/SubHeaderBar';
import { TabButton } from '@/components/TabButton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BlobbiStageVisual } from '@/blobbi/ui/BlobbiStageVisual';
import { BlobbiHatchingCeremony } from '@/blobbi/onboarding/components/BlobbiHatchingCeremony';
import { BlobbiPhotoModal } from '@/blobbi/ui/BlobbiPhotoModal';

import { useBlobbiCompanionData } from '@/blobbi/companion/hooks/useBlobbiCompanionData';
import { useLayoutOptions } from '@/contexts/LayoutContext';

import { openUrl } from '@/lib/downloadFile';
import { cn } from '@/lib/utils';

import {
  KIND_BLOBBI_STATE,
  KIND_BLOBBONAUT_PROFILE,
  updateBlobbiTags,
  updateBlobbonautTags,
  filterMigratedLegacyCompanions,
  type BlobbiCompanion,
  type BlobbiStats,
  type BlobbonautProfile,
  type StorageItem,
} from '@/blobbi/core/lib/blobbi';

import { applyBlobbiDecay } from '@/blobbi/core/lib/blobbi-decay';
import { getBlobbiStatDisplayState } from '@/blobbi/core/lib/blobbi-segments';
import { useSeedIdentitySync } from '@/blobbi/core/hooks/useSeedIdentitySync';

import { getLiveShopItems } from '@/blobbi/shop/lib/blobbi-shop-items';

import {
  PlayMusicModal,
  InlineMusicPlayer,
  InlineSingCard,
  useBlobbiUseInventoryItem,
  useBlobbiHatch,
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
   applyXPGain,
   POOP_CLEANUP_XP,
   type InventoryAction,
  type DirectAction,
  type InlineActivityState,
  type SelectedTrack,
  type BlobbiReactionState,
  type StartIncubationMode,
} from '@/blobbi/actions';
// DailyMissionsPanel no longer used — daily missions rendered inline in MissionsTabContent
import { BlobbiOnboardingFlow } from '@/blobbi/onboarding';
import { useBlobbiActionsRegistration, type UseItemFunction } from '@/blobbi/companion/interaction';
import { BlobbiDevEditor, useBlobbiDevUpdate, type BlobbiDevUpdates, BlobbiEmotionPanel, useEffectiveEmotion, isLocalhostDev } from '@/blobbi/dev';
import { useStatusReaction } from '@/blobbi/ui/hooks/useStatusReaction';
import { buildSleepingRecipe } from '@/blobbi/ui/lib/recipe';
import {
  BlobbiRoomShell,
  BlobbiRoomHero,
  ItemCarousel,
  RoomActionButton,
  type BlobbiRoomId,
  type CarouselEntry,
  type PoopState,
  isValidRoomId,
  DEFAULT_INITIAL_ROOM,
  DEFAULT_ROOM_ORDER,
  getPoopsInRoom,
  hasAnyPoop,
} from '@/blobbi/rooms';
import { ROOM_BOTTOM_BAR_CLASS } from '@/blobbi/rooms/lib/room-layout';
import { buildGuideTarget, getGuideRoomDirection, type GuideTarget } from '@/blobbi/rooms/lib/stat-guide-config';
import { getActionEmotion, type ActionType } from '@/blobbi/ui/lib/status-reactions';
import type { BlobbiEmotion } from '@/blobbi/ui/lib/emotions';



/**
 * Get the localStorage key for the selected Blobbi.
 * User-scoped: blobbi:selected:d:<pubkey>
 */
function getSelectedBlobbiKey(pubkey: string): string {
  return `blobbi:selected:d:${pubkey}`;
}

/** Enable debug logging in development only */
const DEBUG_BLOBBI = import.meta.env.DEV;

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

  useLayoutOptions({ hasSubHeader: true, noOverscroll: true });

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
  const { mutateAsync: publishEvent, isPending: isPublishing } = useNostrPublish();
  const { ensureCanonicalBlobbiBeforeAction } = useBlobbiMigration();
  
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
    companions,
    isLoading: collectionLoading,
    isFetching: collectionFetching,
    invalidate: invalidateCollection,
    updateCompanionEvent,
  } = useBlobbisCollection();
  
  // STEP 2: Filter out legacy companions that have been migrated to canonical format.
  // A legacy Blobbi is hidden when a canonical Blobbi with the same name exists AND
  // the legacy d-tag is no longer in profile.has (confirming migration occurred).
  const filteredCompanions = useMemo(() => {
    if (!profile) return companions;
    return filterMigratedLegacyCompanions(companions, profile.has);
  }, [companions, profile]);

  const filteredCompanionsByD = useMemo(() => {
    const record: Record<string, BlobbiCompanion> = {};
    for (const c of filteredCompanions) {
      record[c.d] = c;
    }
    return record;
  }, [filteredCompanions]);

  // STEP 3: Sync visible companions whose mirror tags are stale.
  // Republishes only companions with actual mismatches (needsSeedIdentitySync flag).
  useSeedIdentitySync(filteredCompanions, updateCompanionEvent);

  // STEP 4: localStorage for UI selection (user-scoped key)
  const localStorageKey = user?.pubkey ? getSelectedBlobbiKey(user.pubkey) : 'blobbi:selected:d:none';
  const [storedSelectedD, setStoredSelectedD] = useLocalStorage<string | null>(localStorageKey, null);
  
  // State for showing the adoption flow (for "Adopt another Blobbi")
  const [showAdoptionFlow, setShowAdoptionFlow] = useState(false);
  
  // STEP 5: Selection Priority
  // 1) localStorage selection (if valid and exists in collection) - USER SELECTION ALWAYS WINS
  // 2) first item from profile.has that exists in companionsByD - preferred ordering
  // 3) first companion in the collection (covers blobbis missing from profile.has)
  // 4) undefined (show selector)
  //
  // CRITICAL: Default selection must NEVER overwrite localStorage.
  // User selection persists only via handleSelectBlobbi, not via this computed value.
  const selectedD = useMemo(() => {
    // Priority 1: localStorage selection (if it exists in filtered collection)
    // USER SELECTION ALWAYS WINS - this is the authoritative source
    if (storedSelectedD && filteredCompanionsByD[storedSelectedD]) {
      if (DEBUG_BLOBBI) {
        console.log('[BlobbiPage] selectedD: using localStorage selection:', storedSelectedD);
      }
      return storedSelectedD;
    }
    
    // Priority 2: First item from profile.has that exists in filtered collection
    // This preserves the user's ordering preference from their profile
    if (profile) {
      for (const d of profile.has) {
        if (filteredCompanionsByD[d]) {
          if (DEBUG_BLOBBI) {
            console.log('[BlobbiPage] selectedD: using default from profile.has:', d, 
              '(storedSelectedD was:', storedSelectedD, 
              storedSelectedD ? (filteredCompanionsByD[storedSelectedD] ? 'exists' : 'NOT in filteredCompanionsByD') : 'null', ')');
          }
          return d;
        }
      }
    }
    
    // Priority 3: First companion in the filtered collection
    if (filteredCompanions.length > 0) {
      const firstD = filteredCompanions[0].d;
      if (DEBUG_BLOBBI) {
        console.log('[BlobbiPage] selectedD: using first companion from collection:', firstD);
      }
      return firstD;
    }
    
    // Priority 4: No valid selection
    if (DEBUG_BLOBBI) {
      console.log('[BlobbiPage] selectedD: no valid selection available');
    }
    return undefined;
  }, [profile, storedSelectedD, filteredCompanionsByD, filteredCompanions]);
  
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
        isLegacy: companion.isLegacy,
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
  
  // ─── Helper: Ensure Canonical Before Action ───
  // Centralized migration helper that auto-migrates legacy pets before any action
  const ensureCanonicalBeforeAction = useCallback(async () => {
    if (!companion || !profile) return null;
    
    return ensureCanonicalBlobbiBeforeAction({
      companion,
      profile,
      updateProfileEvent,
      updateCompanionEvent,
      updateStoredSelectedD: setStoredSelectedD,
    });
  }, [companion, profile, ensureCanonicalBlobbiBeforeAction, updateProfileEvent, updateCompanionEvent, setStoredSelectedD]);
  
  // ─── Rest Action (with automatic legacy migration) ───
  // Operates on the page-selected `companion` (not profile.currentCompanion).
  // The companion floating button has its own independent sleep toggle.
  const handleRest = useCallback(async () => {
    if (!user?.pubkey || !companion) return;

    const isCurrentlySleeping = companion.state === 'sleeping';
    const newState = isCurrentlySleeping ? 'active' : 'sleeping';

    setActionInProgress('rest');
    try {
      // Ensure canonical before action (auto-migrates legacy pets)
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
      const nowStr = now.toString();

      // Get streak updates (putting to sleep/waking counts as care activity)
      const streakUpdates = getStreakTagUpdates(canonical.companion) ?? {};

      const newTags = updateBlobbiTags(canonical.allTags, {
        state: newState,
        hunger: decayResult.stats.hunger.toString(),
        happiness: decayResult.stats.happiness.toString(),
        health: decayResult.stats.health.toString(),
        hygiene: decayResult.stats.hygiene.toString(),
        energy: decayResult.stats.energy.toString(),
        ...streakUpdates,
        last_interaction: nowStr,
        last_decay_at: nowStr,
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
  const { isPending: isHatching } = useBlobbiHatch({
    companion,
    profile,
    ensureCanonicalBeforeAction,
    updateCompanionEvent,
  });
  
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
  
  // Debug log page state decisions
  if (DEBUG_BLOBBI) {
    console.log('[BlobbiPage] State decision:', {
      pageState,
      profileLoading,
      hasProfile: !!profile,
      profileName: profile?.name,
      profileHas: profile?.has?.length ?? 0,
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
  
  // Cases that definitely need ceremony (no need to wait for companions)
  const definitelyNeedsCeremony = !profile;
  // Whether we've finished loading enough data to make the decision
  const companionDataReady = !collectionLoading && (!collectionFetching || companions.length > 0);
  // Cases where we must inspect actual companion stages before deciding.
  // This fires for ALL users with a profile — regardless of onboardingDone —
  // so that accounts with onboardingDone=true but only eggs still get
  // the ceremony.
  const pendingCeremonyCheck = !definitelyNeedsCeremony && !!profile && !ceremonyCheckDone;
  
  // Auto-start ceremony for definite cases (no profile / no pets)
  useEffect(() => {
    if (definitelyNeedsCeremony && !profileLoading && !ceremonyInProgress) {
      setCeremonyInProgress(true);
    }
  }, [definitelyNeedsCeremony, profileLoading, ceremonyInProgress]);
  
  // Resolve pending ceremony check once companions are loaded
  useEffect(() => {
    if (!pendingCeremonyCheck || !companionDataReady || ceremonyInProgress) return;
    
    const eggs = companions.filter(c => c.stage === 'egg');
    const hasHatchedBlobbi = companions.some(c => c.stage === 'baby' || c.stage === 'adult');
    
    // Mark check as done so this effect doesn't re-fire.
    setCeremonyCheckDone(true);
    
    if (hasHatchedBlobbi) {
      // User already has a hatched blobbi — skip ceremony entirely.
      // Auto-fix the onboardingDone flag if it was missing.
      if (DEBUG_BLOBBI) console.log('[BlobbiPage] Skipping ceremony: user has hatched blobbi');
      if (profile && !profile.onboardingDone) {
        const updatedTags = updateBlobbonautTags(profile.allTags, {
          blobbi_onboarding_done: 'true',
        });
        publishEvent({
          kind: KIND_BLOBBONAUT_PROFILE,
          content: '',
          tags: updatedTags,
        }).then(event => {
          updateProfileEvent(event);
          invalidateProfile();
        }).catch(err => console.error('[BlobbiPage] Failed to auto-fix onboardingDone:', err));
      }
    } else if (eggs.length > 0) {
      // User has only eggs — reuse one for the ceremony (don't create a new one).
      // Pick a random egg if multiple exist.
      const egg = eggs.length === 1 ? eggs[0] : eggs[Math.floor(Math.random() * eggs.length)];
      ceremonyEggRef.current = egg;
      if (DEBUG_BLOBBI) console.log('[BlobbiPage] Starting ceremony with existing egg:', egg.d);
      setCeremonyInProgress(true);
    } else {
      // No blobbi events found on relays — treat as new user
      if (DEBUG_BLOBBI) console.log('[BlobbiPage] Starting ceremony: no companions found');
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
      <div className="fixed inset-0 z-[100] bg-background">
        <BlobbiOnboardingFlow
          profile={profile ?? null}
          updateProfileEvent={updateProfileEvent}
          updateCompanionEvent={updateCompanionEvent}
          invalidateProfile={invalidateProfile}
          invalidateCompanion={invalidateCompanion}
          setStoredSelectedD={setStoredSelectedD}
          existingCompanion={ceremonyEggRef.current}
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
  if (collectionFetching && companions.length === 0) {
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
  
  // ─── CASE G: Companions loaded, but no valid selection ───
  // Show selector to pick which pet to display
  if (!selectedD && filteredCompanions.length > 0) {
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
              onComplete={() => setShowAdoptionFlow(false)}
            />
          </DialogContent>
        </Dialog>
      </>
    );
  }
  
  // ─── CASE H: Selection exists but companion not resolved (edge case) ───
  if (!companion || !selectedD) {
    if (DEBUG_BLOBBI) console.log('[BlobbiPage] Showing: selector (companion not resolved)');
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
      'flex flex-col overflow-hidden bg-background/85',
      // Mobile: fixed to escape pb-overscroll on the parent
      'max-sidebar:fixed max-sidebar:inset-0 max-sidebar:top-mobile-bar max-sidebar:z-0',
      // Desktop: normal flow within the center column
      'sidebar:h-dvh',
    )}>
      <div className="mx-auto w-full max-w-2xl lg:max-w-3xl flex-1 min-h-0 flex flex-col">
        {children}
      </div>
    </main>
  );
}

// ─── Dashboard Drawer Type ────────────────────────────────────────────────────

/** Which drawer is open; 'none' = room view visible */
type DashboardDrawer = 'none' | 'missions' | 'more';

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
    wasMigrated: boolean;
    profileAllTags: string[][];
    profileEvent: import('@nostrify/nostrify').NostrEvent;
    profileStorage: StorageItem[];
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
  
  const isSleeping = companion.state === 'sleeping';
  const isEgg = companion.stage === 'egg';
  
  // ─── Active Drawer ───
  const [activeDrawer, setActiveDrawer] = useState<DashboardDrawer>('none');

  // ─── Room Navigation ───
  const [currentRoom, setCurrentRoom] = useState<BlobbiRoomId>(
    isSleeping ? 'rest' : isValidRoomId(profile?.room) ? profile.room : DEFAULT_INITIAL_ROOM,
  );
  const poopStateRef = useRef<PoopState | null>(null);

  // Auto-navigate to bedroom when blobbi falls asleep
  useEffect(() => {
    if (isSleeping) {
      setCurrentRoom('rest');
    }
  }, [isSleeping]);

  // ─── Stat Guide Flow ───
  const [guideTarget, setGuideTarget] = useState<GuideTarget | null>(null);

  // Start a guide: build the target and set state
  const handleGuide = useCallback((stat: keyof BlobbiStats) => {
    setGuideTarget(buildGuideTarget(stat, currentRoom));
  }, [currentRoom]);

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
  
  // Projected state with decay applied (UI-only, recalculates every 60s)
  const projectedState = useProjectedBlobbiState(companion);

  // Clear sleep guide after companion actually enters sleeping state
  useEffect(() => {
    if (isSleeping && guideTarget?.targetAction === 'sleep') {
      setGuideTarget(null);
    }
  }, [isSleeping, guideTarget]);
  
  // Measure hero container width for responsive stat arc radius
  const heroRef = useRef<HTMLDivElement>(null);
  const [heroWidth, setHeroWidth] = useState(375);
  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setHeroWidth(entry.contentRect.width));
    ro.observe(el);
    setHeroWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  
  // Modal states (only for things that genuinely need modals)
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [showHatchCeremony, setShowHatchCeremony] = useState(false);
  
  // Reset hatch ceremony when switching companions
  useEffect(() => {
    setShowHatchCeremony(false);
  }, [selectedD]);
  
  // DEV ONLY: Emotion panel state
  const [showEmotionPanel, setShowEmotionPanel] = useState(false);
  
  // DEV ONLY: Get effective emotion (dev override or base)
  const devEmotionOverride = useEffectiveEmotion();
  
  // Action override emotion - set when Blobbi is doing an action (eating, cleaning, etc.)
  // This takes priority over status reactions but not dev override
  const [actionOverrideEmotion, setActionOverrideEmotion] = useState<BlobbiEmotion | null>(null);
  
  // Status-based automatic reactions (recipe-first pipeline).
  // Uses projected stats (with decay applied) for accurate reactions.
  // Body effects (dirt, stink) are folded into the recipe by the resolver —
  // no separate bodyEffects prop needed.
  const currentStats = useMemo(() => ({
    hunger: projectedState?.stats.hunger ?? companion.stats.hunger ?? 100,
    happiness: projectedState?.stats.happiness ?? companion.stats.happiness ?? 100,
    health: projectedState?.stats.health ?? companion.stats.health ?? 100,
    hygiene: projectedState?.stats.hygiene ?? companion.stats.hygiene ?? 100,
    energy: projectedState?.stats.energy ?? companion.stats.energy ?? 100,
  }), [projectedState, companion.stats]);
  
  const { recipe: rawStatusRecipe, recipeLabel: rawStatusRecipeLabel } = useStatusReaction({
    stats: currentStats,
    enabled: !isEgg, // Keep enabled during sleep so body effects still resolve
    actionOverride: isSleeping ? null : actionOverrideEmotion,
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
  const dailyMissions = useDailyMissions({ availableStages, profileContent: profile?.content });
  
  // Hatch tasks hook - only active when incubating (egg stage)
  // Evolution missions now come from companion (kind 31124), not dailyMissions
  const hatchTasks = useHatchTasks(
    isIncubating ? companion : null,
  );
  
  // Evolve tasks hook - only active when evolving (baby stage)
  // Evolution missions now come from companion (kind 31124), not dailyMissions
  const evolveTasks = useEvolveTasks(
    isEvolvingState ? companion : null,
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
        content: '',
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
    setActionOverrideEmotion(null);
  };
  
  // Handle music playback state changes (for Blobbi reaction)
  const handleMusicPlaybackStart = () => {
    setBlobbiReaction('listening');
    setActionOverrideEmotion(getActionEmotion('music'));
  };
  
  const handleMusicPlaybackStop = () => {
    setBlobbiReaction('idle');
    setActionOverrideEmotion(null);
  };
  
  // Handle sing recording state changes (for Blobbi reaction)
  const handleSingRecordingStart = () => {
    setBlobbiReaction('singing');
    setActionOverrideEmotion(getActionEmotion('sing'));
  };
  
  const handleSingRecordingStop = () => {
    setBlobbiReaction('idle');
    setActionOverrideEmotion(null);
  };
  
  // Handle opening track picker to change track (from inline player)
  const handleChangeTrack = () => {
    setShowTrackPickerModal(true);
  };
  
  // Persist evolution mission progress (debounced) to kind 31124 so it survives page refresh
  usePersistEvolutionProgress(companion.d, updateCompanionEvent);

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

  const handlePoopCleaned = useCallback(() => {
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
  }, [ensureCanonicalBeforeAction, publishEvent, updateCompanionEvent]);

  // Handle using an item from the items tab
  const handleUseItemFromTab = (itemId: string) => {
    const action = getActionForItem(itemId);
    if (!action || isUsingItem) return;
    setUsingItemId(itemId);
    setActionOverrideEmotion(getActionEmotion(action as ActionType));
    onUseItem(itemId, action).then(() => {
      // Clear guide only after the action succeeds
      if (guideTarget?.targetItemId === itemId) setGuideTarget(null);
    }).finally(() => {
      setUsingItemId(null);
      setTimeout(() => setActionOverrideEmotion(null), 1500);
    });
  };
  
  return (
    <DashboardShell>
      {/* Legacy Migration Notice */}
      {companion.isLegacy && (
        <div className="mx-4 mt-2 sm:mx-6 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <p className="text-sm text-amber-600 dark:text-amber-400">
            This pet uses an older format. It will be automatically upgraded on your next interaction.
          </p>
        </div>
      )}
      
      {/* Backdrop — tapping outside the drawer collapses it */}
      {activeDrawer !== 'none' && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setActiveDrawer('none')}
        />
      )}

      {/* ─── Drawer + Tab Bar — overlays the room ─── */}
      <div className="absolute top-0 left-0 right-0 z-20">
        <div
          className="bg-background/90 backdrop-blur-sm overflow-hidden transition-[max-height] duration-250 ease-in-out"
          style={{ maxHeight: activeDrawer !== 'none' ? '256px' : '0' }}
        >
          <ScrollArea style={{ height: 248 }}>
            <div className="max-w-2xl mx-auto w-full pb-4 pt-2">
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
                  onEvolve={onEvolve}
                  isEvolving={isEvolving}
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
                  onDevInstantTransition={isEgg ? () => setShowHatchCeremony(true) : isBaby ? onEvolve : undefined}
                  isHatching={isHatching}
                  isEvolving={isEvolving}
                />
              )}
            </div>
          </ScrollArea>
        </div>

        <SubHeaderBar pinned className="relative !top-0">
          <TabButton label="Quests" active={activeDrawer === 'missions'} onClick={() => toggleDrawer('missions')}>
            <span className="flex items-center gap-1.5">
              <Target className="size-4" />
              <span className="text-sm">Quests</span>
            </span>
          </TabButton>
          <TabButton label="Blobbis" active={activeDrawer === 'more'} onClick={() => toggleDrawer('more')}>
            <span className="flex items-center gap-1.5">
              <Egg className="size-4" />
              <span className="text-sm">Blobbis</span>
            </span>
          </TabButton>
        </SubHeaderBar>
      </div>

      {/* ─── Room View (always visible behind drawer) ─── */}
      <BlobbiRoomShell
        roomId={currentRoom}
        onChangeRoom={(room) => {
          if (isSleeping) {
            toast({ title: 'Zzz...', description: `${companion.name} is sleeping. Wake up first!` });
            return;
          }
          setCurrentRoom(room);
        }}
        isSleeping={isSleeping}
        hunger={currentStats.hunger}
        lastFeedTimestamp={companion.lastInteraction ? companion.lastInteraction * 1000 : undefined}
        poopStateRef={poopStateRef}
        onPoopCleaned={handlePoopCleaned}
        guideRoomDirection={guideRoomDirection}
        hero={
          <BlobbiRoomHero
            companion={companion}
            currentStats={currentStats}
            isSleeping={isSleeping}
            isEgg={isEgg}
            statusRecipe={statusRecipe}
            statusRecipeLabel={statusRecipeLabel}
            effectiveEmotion={effectiveEmotion}
            hasDevOverride={hasDevOverride}
            blobbiReaction={blobbiReaction}
            isActiveFloatingCompanion={isActiveFloatingCompanion}
            isUpdatingCompanion={isUpdatingCompanion}
            handleSetAsCompanion={handleSetAsCompanion}
            heroRef={heroRef}
            heroWidth={heroWidth}
            roomId={currentRoom}
            onGuide={handleGuide}
          />
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
            companion={companion}
            currentStats={currentStats}
            profile={profile}
            isEgg={isEgg}
            isSleeping={isSleeping}
            isUsingItem={isUsingItem}
            usingItemId={usingItemId}
            isPublishing={isPublishing}
            actionInProgress={actionInProgress}
            isDirectActionPending={isDirectActionPending}
            isCurrentCompanion={isCurrentCompanion}
            canBeCompanion={canBeCompanion}
            isUpdatingCompanion={isUpdatingCompanion}
            handleSetAsCompanion={handleSetAsCompanion}
            handleUseItemFromTab={handleUseItemFromTab}
            handleDirectAction={handleDirectAction}
            onUseItem={onUseItem}
            onRest={onRest}
            setShowPhotoModal={setShowPhotoModal}
            poopStateRef={poopStateRef}
            guideHighlightId={guideHighlightId}
            guideActionGlow={guideActionGlow}
          />
        )}
      </BlobbiRoomShell>
      
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
        <div className="fixed inset-0 z-[100] bg-background">
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

// ─── Room Bottom Bar ──────────────────────────────────────────────────────────

interface RoomBottomBarProps {
  room: BlobbiRoomId;
  companion: BlobbiCompanion;
  /** Projected stats (decay-applied) matching what the stat rings display. */
  currentStats: BlobbiStats;
  profile: BlobbonautProfile | null;
  isEgg: boolean;
  isSleeping: boolean;
  isUsingItem: boolean;
  usingItemId: string | null;
  isPublishing: boolean;
  actionInProgress: string | null;
  isDirectActionPending: boolean;
  isCurrentCompanion: boolean;
  canBeCompanion: boolean;
  isUpdatingCompanion: boolean;
  handleSetAsCompanion: () => Promise<void>;
  handleUseItemFromTab: (itemId: string) => void;
  handleDirectAction: (action: DirectAction) => void;
  onUseItem: (itemId: string, action: InventoryAction) => Promise<void>;
  onRest: () => void;
  setShowPhotoModal: React.Dispatch<React.SetStateAction<boolean>>;
  poopStateRef: React.MutableRefObject<PoopState | null>;
  /** Item ID to highlight in the carousel (guide flow). */
  guideHighlightId?: string | null;
  /** Action to glow (guide flow, e.g. 'sleep'). */
  guideActionGlow?: string | null;
}

function RoomBottomBar(props: RoomBottomBarProps) {
  switch (props.room) {
    case 'home': return <HomeBar {...props} />;
    case 'kitchen': return <KitchenBar {...props} />;
    case 'care': return <CareBar {...props} />;
    case 'rest': return <RestBar {...props} />;
    case 'closet': return <ClosetBar />;
  }
}

// ── Home: toys + music/sing, photo left, companion right ──

function HomeBar({
  isUsingItem,
  usingItemId,
  isPublishing,
  actionInProgress,
  isCurrentCompanion,
  canBeCompanion,
  isUpdatingCompanion,
  handleSetAsCompanion,
  handleUseItemFromTab,
  handleDirectAction,
  setShowPhotoModal,
  guideHighlightId,
}: RoomBottomBarProps) {
  const carouselItems = useMemo<CarouselEntry[]>(() => {
    const toys = getLiveShopItems()
      .filter(i => i.type === 'toy')
      .map(i => ({ id: i.id, icon: <span>{i.icon}</span>, label: i.name }));
    return [
      ...toys,
      {
        id: '__action_music',
        icon: <div className="size-10 sm:size-12 rounded-full flex items-center justify-center bg-pink-500/15 text-pink-500"><Music className="size-5 sm:size-6" /></div>,
        label: 'Music',
      },
      {
        id: '__action_sing',
        icon: <div className="size-10 sm:size-12 rounded-full flex items-center justify-center bg-purple-500/15 text-purple-500"><Mic className="size-5 sm:size-6" /></div>,
        label: 'Sing',
      },
    ];
  }, []);

  const isDisabled = isPublishing || actionInProgress !== null || isUsingItem;

  const handleCarouselUse = useCallback((id: string) => {
    if (id === '__action_music') handleDirectAction('play_music');
    else if (id === '__action_sing') handleDirectAction('sing');
    else handleUseItemFromTab(id);
  }, [handleDirectAction, handleUseItemFromTab]);

  return (
    <div className={ROOM_BOTTOM_BAR_CLASS}>
      <div className="flex items-center justify-between gap-1 sm:gap-3">
        <RoomActionButton
          icon={<Camera className="size-7 sm:size-9" />}
          label="Photo"
          color="text-pink-500"
          glowHex="#ec4899"
          onClick={() => setShowPhotoModal(true)}
        />
        <div className="flex-1 min-w-0 flex justify-center">
          <ItemCarousel
            items={carouselItems}
            onUse={handleCarouselUse}
            activeItemId={isUsingItem ? usingItemId : null}
            disabled={isDisabled}
            highlightId={guideHighlightId}
          />
        </div>
        {canBeCompanion ? (
          <RoomActionButton
            icon={<Footprints className="size-7 sm:size-9" />}
            label={isCurrentCompanion ? 'With you' : 'Take along'}
            color={isCurrentCompanion ? 'text-emerald-500' : 'text-violet-500'}
            glowHex={isCurrentCompanion ? '#10b981' : '#8b5cf6'}
            onClick={handleSetAsCompanion}
            disabled={isUpdatingCompanion}
            loading={isUpdatingCompanion}
          />
        ) : (
          <div className="w-14 sm:w-20 shrink-0" />
        )}
      </div>
    </div>
  );
}

// ── Kitchen: food carousel, shovel left (if poop), fridge right ──

/** Lucide icon for each stat key */
const STAT_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  hunger: Utensils,
  happiness: Gamepad2,
  health: Heart,
  hygiene: Droplets,
  energy: Zap,
};

function KitchenBar({
  companion,
  currentStats,
  isUsingItem,
  usingItemId,
  isPublishing,
  actionInProgress,
  handleUseItemFromTab,
  poopStateRef,
  guideHighlightId,
}: RoomBottomBarProps) {
  const [showFridge, setShowFridge] = useState(false);
  const poopState = poopStateRef.current;

  const foodItems = useMemo(() => {
    const items = getLiveShopItems().filter(i => i.type === 'food');
    return items.map(item => ({
      ...item,
      statChanges: previewStatChangesWithSegments(currentStats, item.effect, companion.stage),
    }));
  }, [currentStats, companion.stage]);

  const foodEntries = useMemo<CarouselEntry[]>(() =>
    foodItems.map(i => ({ id: i.id, icon: <span>{i.icon}</span>, label: i.name })),
  [foodItems]);

  const isDisabled = isPublishing || actionInProgress !== null || isUsingItem;
  const kitchenPoops = poopState ? getPoopsInRoom(poopState.poops, 'kitchen') : [];
  const anyPoop = poopState ? hasAnyPoop(poopState.poops) : false;

  return (
    <>
      {/* Poop display */}
      {kitchenPoops.map((poop) => (
        <button
          key={poop.id}
          onClick={() => poopState?.shovelMode && poopState.onRemovePoop(poop.id)}
          className={cn(
            'absolute z-10 transition-all duration-300',
            poopState?.shovelMode ? 'cursor-pointer hover:scale-150 active:scale-75' : 'pointer-events-none',
          )}
          style={{ bottom: `${poop.position.bottom}%`, left: `${poop.position.left}%` }}
        >
          <span className={cn('text-2xl sm:text-3xl block', poopState?.shovelMode && 'drop-shadow-lg')}>💩</span>
        </button>
      ))}

      {/* Fridge overlay — blurred grid covering the page, above arrows (z-50) */}
      {showFridge && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-md animate-in fade-in duration-200" onClick={() => setShowFridge(false)}>
          <button
            onClick={() => setShowFridge(false)}
            className="absolute top-3 right-3 z-10 size-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close fridge"
          >
            <X className="size-5" strokeWidth={4} />
          </button>

          <div className="flex items-center gap-2 mb-4">
            <Refrigerator className="size-5 text-orange-500" />
            <h3 className="text-sm font-semibold">Fridge</h3>
          </div>

          <div className="flex flex-wrap justify-center gap-1 px-4" onClick={(e) => e.stopPropagation()}>
            {foodItems.map(item => {
              const isThisUsing = isUsingItem && usingItemId === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleUseItemFromTab(item.id)}
                  disabled={isDisabled}
                  className={cn(
                    'relative flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all duration-200',
                    'hover:bg-foreground/5 active:scale-95',
                    isThisUsing && 'bg-foreground/5',
                    isDisabled && !isThisUsing && 'opacity-40',
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
      )}

      {/* Normal bottom bar */}
      <div className={ROOM_BOTTOM_BAR_CLASS}>
        <div className="flex items-center justify-between gap-1 sm:gap-3">
          {anyPoop && poopState ? (
            <RoomActionButton
              icon={<Shovel className="size-7 sm:size-9" />}
              label={poopState.shovelMode ? 'Done' : 'Shovel'}
              color={poopState.shovelMode ? 'text-amber-600' : 'text-stone-500'}
              glowHex={poopState.shovelMode ? '#d97706' : '#78716c'}
              onClick={() => poopState.setShovelMode(prev => !prev)}
              className={poopState.shovelMode ? 'ring-2 ring-amber-500/40 ring-offset-2 ring-offset-background rounded-full' : ''}
            />
          ) : (
            <div className="w-14 sm:w-20 shrink-0" />
          )}
          <div className="flex-1 min-w-0 flex justify-center">
            <ItemCarousel
              items={foodEntries}
              onUse={handleUseItemFromTab}
              activeItemId={isUsingItem ? usingItemId : null}
              disabled={isDisabled}
              highlightId={guideHighlightId}
            />
          </div>
          <RoomActionButton
            icon={<Refrigerator className="size-7 sm:size-9" />}
            label="Fridge"
            color="text-orange-500"
            glowHex="#f97316"
            onClick={() => setShowFridge(true)}
            disabled={isDisabled}
          />
        </div>
      </div>
    </>
  );
}

// ── Care: hygiene + medicine carousel, context-sensitive side buttons ──

function CareBar({
  isUsingItem,
  usingItemId,
  isPublishing,
  actionInProgress,
  handleUseItemFromTab,
  guideHighlightId,
}: RoomBottomBarProps) {
  const allShopItems = useMemo(() => getLiveShopItems(), []);
  const hygieneItems = useMemo(() => allShopItems.filter(i => i.type === 'hygiene'), [allShopItems]);
  const treatItem = useMemo(() => allShopItems.find(i => i.type === 'food'), [allShopItems]);

  const carouselEntries = useMemo<CarouselEntry[]>(() => {
    const hygiene = hygieneItems
      .filter(i => i.id !== 'hyg_towel')
      .map(i => ({ id: i.id, icon: <span>{i.icon}</span>, label: i.name, meta: 'hygiene' }));
    const medicine = allShopItems
      .filter(i => i.type === 'medicine')
      .map(i => ({ id: i.id, icon: <span>{i.icon}</span>, label: i.name, meta: 'medicine' }));
    return [...hygiene, ...medicine];
  }, [hygieneItems, allShopItems]);

  const [focusedMeta, setFocusedMeta] = useState(carouselEntries[0]?.meta ?? 'hygiene');
  const handleFocusChange = useCallback((entry: CarouselEntry) => setFocusedMeta(entry.meta ?? 'hygiene'), []);
  const isHygieneFocused = focusedMeta === 'hygiene';
  const isDisabled = isPublishing || actionInProgress !== null || isUsingItem;
  const towelItem = hygieneItems.find(i => i.id === 'hyg_towel');

  return (
    <div className={ROOM_BOTTOM_BAR_CLASS}>
      <div className="flex items-center justify-between gap-1 sm:gap-3">
        {isHygieneFocused ? (
          towelItem ? (
            <RoomActionButton
              icon={<TowelRack className="size-7 sm:size-9" />}
              label="Towel"
              color="text-cyan-500"
              glowHex="#06b6d4"
              onClick={() => handleUseItemFromTab(towelItem.id)}
              disabled={isDisabled}
              loading={isUsingItem && usingItemId === towelItem.id}
            />
          ) : (
            <div className="w-14 sm:w-20 shrink-0" />
          )
        ) : treatItem ? (
          <RoomActionButton
            icon={<Candy className="size-7 sm:size-9" />}
            label={treatItem.name}
            color="text-pink-400"
            glowHex="#f472b6"
            onClick={() => handleUseItemFromTab(treatItem.id)}
            disabled={isDisabled}
          />
        ) : (
          <div className="w-14 sm:w-20 shrink-0" />
        )}
        <div className="flex-1 min-w-0 flex justify-center">
          <ItemCarousel
            items={carouselEntries}
            onUse={handleUseItemFromTab}
            activeItemId={isUsingItem ? usingItemId : null}
            disabled={isDisabled}
            onFocusChange={handleFocusChange}
            highlightId={guideHighlightId}
          />
        </div>
        {isHygieneFocused ? (
          <RoomActionButton
            icon={<ShowerHead className="size-7 sm:size-9" />}
            label="Shower"
            color="text-blue-500"
            glowHex="#3b82f6"
            onClick={() => {
              const shampoo = hygieneItems.find(i => i.id === 'hyg_shampoo');
              if (shampoo) handleUseItemFromTab(shampoo.id);
            }}
            disabled={isDisabled}
          />
        ) : (
          <div className="w-14 sm:w-20 shrink-0" />
        )}
      </div>
    </div>
  );
}

// ── Rest: sleep/wake button centered ──

function RestBar({ isEgg, isSleeping, onRest, isPublishing, actionInProgress, isUsingItem, guideActionGlow }: RoomBottomBarProps) {
  const isDisabled = isPublishing || actionInProgress !== null || isUsingItem;

  return (
    <div className={ROOM_BOTTOM_BAR_CLASS}>
      <div className="flex items-center justify-center">
        {!isEgg && (
          <RoomActionButton
            icon={
              actionInProgress === 'rest'
                ? <Loader2 className="size-7 sm:size-9 animate-spin" />
                : isSleeping
                  ? <Sun className="size-7 sm:size-9" />
                  : <Moon className="size-7 sm:size-9" />
            }
            label={isSleeping ? 'Wake up' : 'Sleep'}
            color={isSleeping ? 'text-amber-500' : 'text-violet-500'}
            glowHex={isSleeping ? '#f59e0b' : '#8b5cf6'}
            onClick={onRest}
            disabled={isDisabled}
            glow={guideActionGlow === 'sleep'}
          />
        )}
      </div>
    </div>
  );
}

// ── Closet: placeholder ──

function ClosetBar() {
  return (
    <div className={ROOM_BOTTOM_BAR_CLASS}>
      <div className="flex items-center justify-center gap-2 py-1">
        <p className="text-xs text-muted-foreground/40 font-medium">Closet coming soon</p>
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
                ? 'bg-background shadow-sm text-foreground'
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
                ? 'bg-background shadow-sm text-foreground'
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
            {dailyMissions.noMissionsAvailable && (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <Egg className="size-6 text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground">Hatch your Blobbi to unlock daily bounties</p>
              </div>
            )}

            {!dailyMissions.noMissionsAvailable && missions.map(mission => (
              <div
                key={mission.id}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all',
                  mission.complete && 'bg-emerald-500/[0.06]',
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
            {!dailyMissions.noMissionsAvailable && dailyMissions.bonusUnlocked && (
              <div className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-violet-500/[0.06]">
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

            {!dailyMissions.noMissionsAvailable && dailyCompleted === dailyTotal && dailyTotal > 0 && dailyMissions.allComplete && (
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
}: MoreTabContentProps) {
  const isTransitioning = isHatching || isEvolving;

  return (
    <div className="flex flex-col items-center h-full min-h-[210px] px-3 sm:px-4">
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
                  'text-[11px] font-medium max-w-[4.5rem] truncate',
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
                <span className="text-xs font-medium text-muted-foreground max-w-[5rem] truncate">{c.name}</span>
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
        <Skeleton className="size-80 sm:size-96 md:size-[28rem] rounded-full" />
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

// ─── Hatch Ceremony Overlay ───────────────────────────────────────────────────


