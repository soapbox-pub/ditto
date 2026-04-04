import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { nip19 } from 'nostr-tools';
import { Egg, Moon, Sun, RefreshCw, Check, Plus, Camera, AlertTriangle, X, Footprints, Wrench, Theater, ExternalLink, Utensils, Gamepad2, Sparkles, Pill, Music, Mic, Loader2, HeartHandshake, Package, Target, MoreHorizontal, Droplets, Heart, Zap } from 'lucide-react';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useProjectedBlobbiState } from '@/blobbi/core/hooks/useProjectedBlobbiState';
import { getVisibleStats, getStatStatus } from '@/blobbi/core/lib/blobbi-decay';
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
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SubHeaderBar } from '@/components/SubHeaderBar';
import { TabButton } from '@/components/TabButton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BlobbiStageVisual } from '@/blobbi/ui/BlobbiStageVisual';
import { BlobbiHatchingCeremony } from '@/blobbi/onboarding/components/BlobbiHatchingCeremony';
import { BlobbiPhotoModal } from '@/blobbi/ui/BlobbiPhotoModal';
import { useBlobbiCompanionData } from '@/blobbi/companion/hooks/useBlobbiCompanionData';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { useIsMobile } from '@/hooks/useIsMobile';
import { openUrl } from '@/lib/downloadFile';
import { cn } from '@/lib/utils';

import {
  KIND_BLOBBI_STATE,
  KIND_BLOBBONAUT_PROFILE,
  updateBlobbiTags,
  updateBlobbonautTags,
  type BlobbiCompanion,
  type BlobbonautProfile,
  type StorageItem,
} from '@/blobbi/core/lib/blobbi';

import { applyBlobbiDecay } from '@/blobbi/core/lib/blobbi-decay';

import { getShopItemById, getLiveShopItems } from '@/blobbi/shop/lib/blobbi-shop-items';
import type { ShopItem } from '@/blobbi/shop/types/shop.types';
import { useBlobbiPurchaseItem } from '@/blobbi/shop/hooks/useBlobbiPurchaseItem';
import { canUseItemForStage } from '@/blobbi/actions/lib/blobbi-action-utils';

import {
  BlobbiActionInventoryModal,
  PlayMusicModal,
  InlineMusicPlayer,
  InlineSingCard,
  BlobbiPostModal,
  useBlobbiUseInventoryItem,
  useBlobbiHatch,
  useBlobbiEvolve,
  useBlobbiDirectAction,
  useStartIncubation,
  useStopIncubation,
  useStartEvolution,
  useStopEvolution,
  useSyncTaskCompletions,
  useHatchTasks,
  useEvolveTasks,
  useActiveTaskProcess,
  getInteractionCount,
  getEvolveInteractionCount,
  createMusicActivity,
  createSingActivity,
  createNoActivity,
  getActionForItem,
  trackDailyMissionProgress,
  getStreakTagUpdates,
  useDailyMissions,
  useClaimMissionReward,
  type InventoryAction,
  type DirectAction,
  type InlineActivityState,
  type SelectedTrack,
  type BlobbiReactionState,
  type StartIncubationMode,
} from '@/blobbi/actions';
import { useRerollMission } from '@/blobbi/actions/hooks/useRerollMission';
// DailyMissionsPanel no longer used — daily missions rendered inline in MissionsTabContent
import { BlobbiOnboardingFlow } from '@/blobbi/onboarding';
import { useBlobbiActionsRegistration, type UseItemFunction } from '@/blobbi/companion/interaction';
import { BlobbiDevEditor, useBlobbiDevUpdate, type BlobbiDevUpdates, BlobbiEmotionPanel, useEffectiveEmotion, isLocalhostDev } from '@/blobbi/dev';
import { useStatusReaction } from '@/blobbi/ui/hooks/useStatusReaction';
import { buildSleepingRecipe } from '@/blobbi/ui/lib/recipe';
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

/** Stat threshold below which a Blobbi is considered to need care */
const CARE_THRESHOLD = 40;

/**
 * Check if a companion needs care based on stat thresholds.
 * A Blobbi needs care if any stat is below CARE_THRESHOLD.
 */
function companionNeedsCare(companion: BlobbiCompanion): boolean {
  const { stats } = companion;
  return (
    (stats.hunger !== undefined && stats.hunger < CARE_THRESHOLD) ||
    (stats.happiness !== undefined && stats.happiness < CARE_THRESHOLD) ||
    (stats.hygiene !== undefined && stats.hygiene < CARE_THRESHOLD) ||
    (stats.health !== undefined && stats.health < CARE_THRESHOLD)
  );
}

/** Map stat keys to display labels */
const STAT_LABEL_MAP: Record<string, string> = {
  hunger: 'Hunger',
  happiness: 'Happy',
  health: 'Health',
  hygiene: 'Hygiene',
  energy: 'Energy',
};

/** Map stat keys to indicator colors */
const STAT_COLOR_MAP: Record<string, 'orange' | 'yellow' | 'green' | 'blue' | 'violet'> = {
  hunger: 'orange',
  happiness: 'yellow',
  health: 'green',
  hygiene: 'blue',
  energy: 'violet',
};

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
  
  // STEP 1: Build dList from profile.has[] + currentCompanion
  const dList = useMemo(() => {
    if (!profile) return undefined;
    
    // Build unique list: profile.has[] + currentCompanion (if not already in list)
    const allDs = new Set<string>(profile.has);
    if (profile.currentCompanion && !allDs.has(profile.currentCompanion)) {
      allDs.add(profile.currentCompanion);
    }
    
    const result = Array.from(allDs);
    
    if (DEBUG_BLOBBI) {
      console.log('[Blobbi] dList:', result);
    }
    
    return result.length > 0 ? result : undefined;
  }, [profile]);
  
  // STEP 2 & 3: Fetch ALL Blobbi pets (with chunking in the hook)
  const {
    companionsByD,
    companions,
    isLoading: collectionLoading,
    isFetching: collectionFetching,
    invalidate: invalidateCollection,
    updateCompanionEvent,
  } = useBlobbisCollection(dList);
  
  // STEP 5: localStorage for UI selection (user-scoped key)
  const localStorageKey = user?.pubkey ? getSelectedBlobbiKey(user.pubkey) : 'blobbi:selected:d:none';
  const [storedSelectedD, setStoredSelectedD] = useLocalStorage<string | null>(localStorageKey, null);
  
  // State for showing the Blobbi selector modal
  const [showSelector, setShowSelector] = useState(false);
  
  // State for showing the adoption flow (for "Adopt another Blobbi")
  const [showAdoptionFlow, setShowAdoptionFlow] = useState(false);
  
  // STEP 6: Selection Priority
  // 1) localStorage selection (if valid and exists in collection) - USER SELECTION ALWAYS WINS
  // 2) first item from profile.has that exists in companionsByD - DEFAULT ONLY, never persisted
  // 3) undefined (show selector)
  //
  // CRITICAL: Default selection must NEVER overwrite localStorage.
  // User selection persists only via handleSelectBlobbi, not via this computed value.
  const selectedD = useMemo(() => {
    if (!profile) return undefined;
    
    // Priority 1: localStorage selection (if it exists in loaded collection)
    // USER SELECTION ALWAYS WINS - this is the authoritative source
    if (storedSelectedD && companionsByD[storedSelectedD]) {
      if (DEBUG_BLOBBI) {
        console.log('[BlobbiPage] selectedD: using localStorage selection:', storedSelectedD);
      }
      return storedSelectedD;
    }
    
    // Priority 2: First item from profile.has that exists in companionsByD
    // This is a DEFAULT - it should NOT be persisted to localStorage
    for (const d of profile.has) {
      if (companionsByD[d]) {
        if (DEBUG_BLOBBI) {
          console.log('[BlobbiPage] selectedD: using default from profile.has:', d, 
            '(storedSelectedD was:', storedSelectedD, 
            storedSelectedD ? (companionsByD[storedSelectedD] ? 'exists' : 'NOT in companionsByD') : 'null', ')');
        }
        return d;
      }
    }
    
    // Priority 3: No valid selection
    if (DEBUG_BLOBBI) {
      console.log('[BlobbiPage] selectedD: no valid selection available');
    }
    return undefined;
  }, [profile, storedSelectedD, companionsByD]);
  
  // NOTE: We intentionally do NOT auto-save the computed selectedD to localStorage.
  // This prevents the default selection from overwriting user selections during:
  // - WebSocket updates
  // - Query refetches  
  // - Race conditions where storedSelectedD is not yet in companionsByD
  //
  // User selections are only persisted via handleSelectBlobbi (line ~232).
  
  // Get the selected companion from the collection
  const companion = selectedD ? companionsByD[selectedD] ?? null : null;
  
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
  const companionLoading = collectionLoading;
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
    setShowSelector(false);
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
      invalidateCompanion,
      invalidateProfile,
    });
  }, [companion, profile, ensureCanonicalBlobbiBeforeAction, updateProfileEvent, updateCompanionEvent, setStoredSelectedD, invalidateCompanion, invalidateProfile]);
  
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

      const event = await publishEvent({
        kind: KIND_BLOBBI_STATE,
        content: canonical.content,
        tags: newTags,
      });

      updateCompanionEvent(event);
      invalidateCompanion();
      if (canonical.wasMigrated) {
        invalidateProfile();
      }

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
  }, [user?.pubkey, companion, ensureCanonicalBeforeAction, publishEvent, updateCompanionEvent, invalidateCompanion, invalidateProfile]);
  
  // ─── Use Inventory Item Hook ───
  const { mutateAsync: executeUseItem, isPending: isUsingItem } = useBlobbiUseInventoryItem({
    companion,
    profile,
    ensureCanonicalBeforeAction,
    updateCompanionEvent,
    updateProfileEvent,
    invalidateCompanion,
    invalidateProfile,
  });
  
  // Handler for using an inventory item (with optional quantity)
  const handleUseItem = useCallback(async (itemId: string, action: InventoryAction, quantity: number = 1) => {
    await executeUseItem({ itemId, action, quantity });
  }, [executeUseItem]);
  
  // ─── Blobbi Actions Registration ───
  // Register item use functionality with the global context so BlobbiCompanionLayer can use it
  const useItemForContext = useMemo<UseItemFunction | null>(() => {
    // Only provide the function when companion and profile are available
    if (!companion || !profile) return null;
    
    return async (itemId, action, quantity = 1) => {
      try {
        const result = await executeUseItem({ itemId, action, quantity });
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
  const { mutateAsync: executeHatch, isPending: isHatching } = useBlobbiHatch({
    companion,
    profile,
    ensureCanonicalBeforeAction,
    updateCompanionEvent,
    invalidateCompanion,
    invalidateProfile,
  });
  
  const { mutateAsync: executeEvolve, isPending: isEvolving } = useBlobbiEvolve({
    companion,
    profile,
    ensureCanonicalBeforeAction,
    updateCompanionEvent,
    invalidateCompanion,
    invalidateProfile,
  });
  
  // Handler for hatching (egg -> baby)
  const handleHatch = useCallback(async () => {
    await executeHatch();
  }, [executeHatch]);
  
  // Handler for evolution (baby -> adult)
  const handleEvolve = useCallback(async () => {
    await executeEvolve();
  }, [executeEvolve]);
  
  // ─── Direct Action Hook ───
  const { mutateAsync: executeDirectAction, isPending: isDirectActionPending } = useBlobbiDirectAction({
    companion,
    ensureCanonicalBeforeAction,
    updateCompanionEvent,
    invalidateCompanion,
    invalidateProfile,
  });
  
  // Handler for direct actions (play_music, sing)
  const handleDirectAction = useCallback(async (action: DirectAction) => {
    await executeDirectAction({ action });
  }, [executeDirectAction]);
  
  // ─── DEV ONLY: State Editor Hook ───
  const { mutateAsync: executeDevUpdate, isPending: isDevUpdating } = useBlobbiDevUpdate({
    companion,
    updateCompanionEvent,
    invalidateCompanion,
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
    if (!dList || dList.length === 0) return 'profile-no-pets';
    if (companionLoading) return 'loading-companions';
    if (companionFetching && companions.length === 0) return 'fetching-companions';
    if (companions.length === 0) return 'pets-not-found';
    if (!selectedD) return 'no-selection';
    if (!companion) return 'companion-not-resolved';
    return 'dashboard';
  }, [profileLoading, profile, dList, companionLoading, companionFetching, companions.length, selectedD, companion]);
  
  // Debug log page state decisions
  if (DEBUG_BLOBBI) {
    console.log('[BlobbiPage] State decision:', {
      pageState,
      profileLoading,
      hasProfile: !!profile,
      profileName: profile?.name,
      profileHas: profile?.has?.length ?? 0,
      dListLength: dList?.length ?? 0,
      companionLoading,
      companionFetching,
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
  // Ceremony is needed when:
  // - No profile exists (first time user)
  // - Profile exists but has no pets
  // - Profile exists with pets but onboarding not done (e.g. page refresh
  //   mid-ceremony, or user only has unhatched eggs)
  const [ceremonyInProgress, setCeremonyInProgress] = useState(false);
  const needsCeremony = !profile
    || !dList || dList.length === 0
    || (profile && !profile.onboardingDone);
  
  // Auto-start ceremony when conditions are met
  useEffect(() => {
    if (needsCeremony && !profileLoading) {
      setCeremonyInProgress(true);
    }
  }, [needsCeremony, profileLoading]);
  
  // ─── CASE A: Profile still loading ───
  if (profileLoading && !ceremonyInProgress) {
    return <DashboardLoadingState />;
  }
  
  // ─── CASE B/C: Hatching ceremony (no profile, or profile with no pets) ───
  // Stays mounted until the ceremony explicitly completes, even if the
  // underlying data changes during the ceremony.
  if (ceremonyInProgress) {
    if (DEBUG_BLOBBI) console.log('[BlobbiPage] Showing: hatching ceremony');
    return (
      <BlobbiOnboardingFlow
        profile={profile ?? null}
        updateProfileEvent={updateProfileEvent}
        updateCompanionEvent={updateCompanionEvent}
        invalidateProfile={invalidateProfile}
        invalidateCompanion={invalidateCompanion}
        setStoredSelectedD={setStoredSelectedD}
        onComplete={() => setCeremonyInProgress(false)}
      />
    );
  }
  
  // After ceremony check, profile and dList must exist
  if (!profile || !dList || dList.length === 0) {
    return <DashboardLoadingState />;
  }
  
  // ─── CASE D: Profile has pet references, but companions still loading ───
  if (companionLoading) {
    if (DEBUG_BLOBBI) console.log('[BlobbiPage] Showing: loading companions');
    return <DashboardLoadingState />;
  }
  
  // ─── CASE E: Profile has pet references, but companions not yet resolved (fetching) ───
  if (companionFetching && companions.length === 0) {
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
  
  // ─── CASE F: Profile has pet references, but pets not found on relays ───
  // This is a data sync issue - show error state, NOT onboarding
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
              Your profile references {dList.length} pet(s), but the data couldn't be loaded from relays.
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
  if (!selectedD && companions.length > 0) {
    if (DEBUG_BLOBBI) console.log('[BlobbiPage] Showing: pet selector');
    return (
      <>
        <BlobbiSelectorPage
          companions={companions}
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
          companions={companions}
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
      companions={companions}
      selectedD={selectedD}
      showSelector={showSelector}
      setShowSelector={setShowSelector}
      onSelectBlobbi={handleSelectBlobbi}
      onRest={handleRest}
      onUseItem={handleUseItem}
      onDirectAction={handleDirectAction}
      isUsingItem={isUsingItem}
      isDirectActionPending={isDirectActionPending}
      actionInProgress={actionInProgress}
      isPublishing={isPublishing}
      profile={profile}
      onHatch={handleHatch}
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
      'flex flex-col overflow-hidden',
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

/** Which drawer is open; 'none' = all closed */
type DashboardDrawer = 'none' | 'care' | 'items' | 'missions' | 'more';

// ─── Main Blobbi Dashboard ────────────────────────────────────────────────────

interface BlobbiDashboardProps {
  companion: BlobbiCompanion;
  companions: BlobbiCompanion[];
  selectedD: string;
  showSelector: boolean;
  setShowSelector: (show: boolean) => void;
  onSelectBlobbi: (d: string) => void;
  onRest: () => void;
  onUseItem: (itemId: string, action: InventoryAction, quantity?: number) => Promise<void>;
  onDirectAction: (action: DirectAction) => Promise<void>;
  isUsingItem: boolean;
  isDirectActionPending: boolean;
  actionInProgress: string | null;
  isPublishing: boolean;
  profile: BlobbonautProfile | null;
  // Stage transition handlers
  onHatch: () => Promise<void>;
  onEvolve: () => Promise<void>;
  isHatching: boolean;
  isEvolving: boolean;
  // Adoption flow props
  publishEvent: (params: { kind: number; content: string; tags: string[][] }) => Promise<import('@nostrify/nostrify').NostrEvent>;
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
  showSelector,
  setShowSelector,
  onSelectBlobbi,
  onRest,
  onUseItem,
  onDirectAction,
  isUsingItem,
  isDirectActionPending,
  actionInProgress,
  isPublishing,
  profile,
  onHatch,
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
  const isMobile = useIsMobile();
  const [activeDrawer, setActiveDrawer] = useState<DashboardDrawer>(isMobile ? 'none' : 'care');
  
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
  
  // Inventory action modal state (still used for the confirmation dialog)
  const [inventoryAction, setInventoryAction] = useState<InventoryAction | null>(null);
  const [usingItemId, setUsingItemId] = useState<string | null>(null);
  
  // Track selection modal (for changing tracks in music player)
  const [showTrackPickerModal, setShowTrackPickerModal] = useState(false);
  
  // Inline activity state - only one activity can be active at a time
  const [inlineActivity, setInlineActivity] = useState<InlineActivityState>(createNoActivity());
  
  // Blobbi reaction state - drives visual reactions to activities
  const [blobbiReaction, setBlobbiReaction] = useState<BlobbiReactionState>('idle');
  
  // Incubation/Hatch task state
  const [showPostModal, setShowPostModal] = useState(false);
  
  // State detection for tasks
  // Note: isEvolving prop = mutation pending state, isEvolvingState = companion in evolving state
  const isIncubating = companion.state === 'incubating';
  const isEvolvingState = companion.state === 'evolving';
  const isBaby = companion.stage === 'baby';
  const canStartIncubation = isEgg && !isIncubating && !isEvolvingState;
  const canStartEvolution = isBaby && !isEvolvingState && !isIncubating;
  
  // Hatch tasks hook - only active when incubating (egg stage)
  const hatchInteractionCount = getInteractionCount(companion);
  const hatchTasks = useHatchTasks(
    isIncubating ? companion : null,
    hatchInteractionCount
  );
  
  // Evolve tasks hook - only active when evolving (baby stage)
  const evolveInteractionCount = getEvolveInteractionCount(companion);
  const evolveTasks = useEvolveTasks(
    isEvolvingState ? companion : null,
    evolveInteractionCount
  );
  
  // ─── Unified Task Process Abstraction ───
  // This hook consolidates all scattered if/else logic for hatch vs evolve tasks
  // It provides:
  // - Unified config (type, isActive, interactionThreshold)
  // - Unified tasks array
  // - Badge count (includes ALL tasks: persistent + dynamic)
  // - Sync data (includes ONLY persistent tasks)
  const taskProcess = useActiveTaskProcess(companion, hatchTasks, evolveTasks);
  
  // Extract commonly used values for convenience
  const refetchCurrentTasks = taskProcess.refetch;
  
  // Start incubation hook
  const { mutateAsync: startIncubation, isPending: isStartingIncubation } = useStartIncubation({
    companion,
    profile,
    ensureCanonicalBeforeAction,
    updateCompanionEvent,
    invalidateCompanion,
    invalidateProfile,
  });
  
  // Stop incubation hook
  const { mutateAsync: stopIncubation, isPending: isStoppingIncubation } = useStopIncubation({
    companion,
    ensureCanonicalBeforeAction,
    updateCompanionEvent,
    invalidateCompanion,
    invalidateProfile,
  });
  
  // Start evolution hook
  const { mutateAsync: startEvolution, isPending: isStartingEvolution } = useStartEvolution({
    companion,
    ensureCanonicalBeforeAction,
    updateCompanionEvent,
    invalidateCompanion,
    invalidateProfile,
  });
  
  // Stop evolution hook
  const { mutateAsync: stopEvolution, isPending: isStoppingEvolution } = useStopEvolution({
    companion,
    ensureCanonicalBeforeAction,
    updateCompanionEvent,
    invalidateCompanion,
    invalidateProfile,
  });
  
  // Sync hatch task completions hook
  const { mutateAsync: syncTaskCompletions } = useSyncTaskCompletions({
    companion,
    ensureCanonicalBeforeAction,
    updateCompanionEvent,
    invalidateCompanion,
    invalidateProfile,
  });
  
  // Anti-loop protection: track the last synced key to prevent infinite loops
  const lastSyncedKeyRef = useRef<string>('');
  
  // ─── Extract values from taskProcess ───
  // These replace the previous duplicated useMemo blocks
  // IMPORTANT CHANGE: remainingTasksCount NOW includes dynamic tasks (for badge)
  // This was a bug - dynamic tasks should count in badge but never sync to tags
  const { 
    completedPersistentTaskIds: completedTaskIds,  // Stable key for anti-loop
    tasksToSync,                                    // Only persistent tasks (for sync)
    remainingTasksCount,                            // ALL tasks including dynamic (for badge)
    allCompleted: allTasksComplete,                 // All tasks (persistent + dynamic) complete
    isLoading: activeTasksLoading,                  // Loading state
    config: { isActive: isInTaskProcess },          // Whether in a task process
  } = taskProcess;
  
  // Memoize cached completion state for comparison
  const cachedCompletedIds = useMemo(() => {
    if (!companion) return '';
    return [...companion.tasksCompleted].sort().join(',');
  }, [companion]);
  
  // Sync task completions only when there's an actual diff
  // CRITICAL: This effect uses multiple layers of protection against infinite loops:
  // 1. Stable string keys (completedTaskIds) instead of array references
  // 2. Anti-loop ref (lastSyncedKeyRef) to prevent re-triggering after publish
  // 3. Early guards for loading/invalid states
  // 4. Diff check against cached state
  // 5. Dependencies are ONLY stable primitives - NO array references
  // Works for BOTH incubating (hatch) and evolving processes
  useEffect(() => {
    // Guard: Not in an active task process
    if (!isInTaskProcess) return;
    
    // Guard: Still loading
    if (activeTasksLoading) return;
    
    // Guard: No completed tasks
    if (!completedTaskIds) return;
    
    // Guard: Computed matches cached (no diff)
    if (completedTaskIds === cachedCompletedIds) {
      if (DEBUG_BLOBBI) {
        console.log('[BlobbiPage] Task sync skipped: no diff', {
          computed: completedTaskIds,
          cached: cachedCompletedIds,
        });
      }
      return;
    }
    
    // ANTI-LOOP: Skip if we already synced this exact state
    // This prevents the loop: publish -> cache update -> re-render -> publish again
    if (lastSyncedKeyRef.current === completedTaskIds) {
      if (DEBUG_BLOBBI) {
        console.log('[BlobbiPage] Task sync skipped: already synced this key', completedTaskIds);
      }
      return;
    }
    
    if (DEBUG_BLOBBI) {
      console.log('[BlobbiPage] Task sync triggered:', {
        computed: completedTaskIds,
        cached: cachedCompletedIds,
        lastSynced: lastSyncedKeyRef.current,
      });
    }
    
    // Mark as synced BEFORE calling sync to prevent race conditions
    lastSyncedKeyRef.current = completedTaskIds;
    
    // Call sync (fire-and-forget, but log errors)
    syncTaskCompletions(tasksToSync).catch(err => {
      // On error, reset the ref so we can retry
      lastSyncedKeyRef.current = '';
      console.warn('Failed to sync task completions:', err);
    });
    // CRITICAL: Dependencies are ONLY stable primitives and memoized values
    // - completedTaskIds: stable string key
    // - cachedCompletedIds: stable string key  
    // - tasksToSync: memoized, keyed off completedTaskIds
    // - isInTaskProcess: derived boolean
    // - activeTasksLoading: derived boolean
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedTaskIds, cachedCompletedIds, isInTaskProcess, activeTasksLoading]);
  
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
      let updatedTags: string[][];
      
      if (isCurrentCompanion) {
        // Remove companion: filter out all current_companion tags entirely
        // First apply any other updates (none in this case), then filter out the tag
        updatedTags = updateBlobbonautTags(profile.allTags, {})
          .filter(tag => tag[0] !== 'current_companion');
      } else {
        // Set companion: first remove any existing current_companion tags, then add the new one
        const tagsWithoutCompanion = profile.allTags.filter(tag => tag[0] !== 'current_companion');
        updatedTags = updateBlobbonautTags(tagsWithoutCompanion, {
          current_companion: companion.d,
        });
      }
      
      const event = await publishEvent({
        kind: KIND_BLOBBONAUT_PROFILE,
        content: '',
        tags: updatedTags,
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
  }, [profile, isCurrentCompanion, canBeCompanion, companion.d, companion.name, publishEvent, updateProfileEvent, invalidateProfile]);
  
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
  
  // Handle opening an inventory action modal (from care tab buttons)
  const handleInventoryAction = (action: InventoryAction) => {
    setInventoryAction(action);
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
  
  // Handle using an item (with optional quantity)
  const handleUseItem = async (itemId: string, quantity: number = 1) => {
    if (!inventoryAction || isUsingItem) return;
    setUsingItemId(itemId);
    // Set action emotion override while item is being used
    setActionOverrideEmotion(getActionEmotion(inventoryAction as ActionType));
    try {
      await onUseItem(itemId, inventoryAction, quantity);
      // Close the modal on success
      setInventoryAction(null);
    } finally {
      setUsingItemId(null);
      // Clear action emotion after a brief delay for visual feedback
      setTimeout(() => setActionOverrideEmotion(null), 1500);
    }
  };
  
  // Handle opening shop from empty state (switches to items drawer)
  const handleOpenShopFromAction = () => {
    setInventoryAction(null);
    setActiveDrawer('items');
  };

  // Handle using item directly from the items tab
  const handleUseItemFromInventory = async (itemId: string, quantity: number) => {
    const action = getActionForItem(itemId);
    if (!action) return;

    setUsingItemId(itemId);
    setActionOverrideEmotion(getActionEmotion(action as ActionType));
    try {
      await onUseItem(itemId, action, quantity);
    } finally {
      setUsingItemId(null);
      setTimeout(() => setActionOverrideEmotion(null), 1500);
    }
  };
  
  // ─── Daily Missions (for missions tab) ───
  const dailyMissions = useDailyMissions({ availableStages });
  const { mutate: claimReward, isPending: isClaimingReward } = useClaimMissionReward(
    profile,
    updateProfileEvent,
  );
  const { mutate: rerollMission, isPending: isRerollingMission } = useRerollMission();
  
  // ─── Items Tab: Resolve inventory items ───
  const inventoryItems = useMemo(() => {
    if (!profile) return [];
    const stage = companion.stage;
    const result: Array<ShopItem & { itemId: string; quantity: number; canUse: boolean; reason?: string }> = [];
    for (const storageItem of profile.storage) {
      const item = getShopItemById(storageItem.itemId);
      if (!item) continue;
      const usability = canUseItemForStage(storageItem.itemId, stage);
      result.push({
        ...item,
        itemId: storageItem.itemId,
        quantity: storageItem.quantity,
        canUse: usability.canUse,
        reason: usability.reason,
      });
    }
    return result;
  }, [profile, companion.stage]);
  
  // ─── Items Tab: Free item acquisition ───
  const { mutate: acquireItem, isPending: isAcquiring } = useBlobbiPurchaseItem(profile);
  const [acquiringItemId, setAcquiringItemId] = useState<string | null>(null);
  
  const handleAcquireItem = (item: ShopItem) => {
    if (isAcquiring) return;
    setAcquiringItemId(item.id);
    acquireItem(
      { itemId: item.id, price: item.price, quantity: 1 },
      { onSettled: () => setAcquiringItemId(null) },
    );
  };
  
  // Handle using an item from the items tab
  const handleUseItemFromTab = (itemId: string) => {
    const action = getActionForItem(itemId);
    if (!action || isUsingItem) return;
    setUsingItemId(itemId);
    setActionOverrideEmotion(getActionEmotion(action as ActionType));
    onUseItem(itemId, action, 1).finally(() => {
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

      {/* ─── Drawer + Tab Bar — overlays the hero ─── */}
      <div className="absolute top-0 left-0 right-0 z-20">
        {/* Sliding drawer — in flow, pushes tabs down when open */}
        <div
          className="bg-background/90 backdrop-blur-sm overflow-hidden transition-[max-height] duration-250 ease-in-out"
          style={{ maxHeight: activeDrawer !== 'none' ? '256px' : '0' }}
        >
          <ScrollArea style={{ height: 248 }}>
            <div className="max-w-2xl mx-auto w-full pb-4 pt-2">
              {activeDrawer === 'care' && (
                <CareTabContent
                  isEgg={isEgg}
                  isSleeping={isSleeping}
                  onOpenItems={() => setActiveDrawer('items')}
                  onDirectAction={handleDirectAction}
                  onRest={onRest}
                  actionInProgress={actionInProgress}
                  isPublishing={isPublishing}
                />
              )}
              {activeDrawer === 'items' && (
                <ItemsTabContent
                  allShopItems={getLiveShopItems()}
                  onUseItem={handleUseItemFromTab}
                  isUsingItem={isUsingItem}
                  usingItemId={usingItemId}
                />
              )}
              {activeDrawer === 'missions' && (
                <MissionsTabContent
                  companion={companion}
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
                  onOpenPostModal={() => setShowPostModal(true)}
                  dailyMissions={dailyMissions}
                  onClaimReward={(id) => claimReward({ missionId: id })}
                  onRerollMission={(id) => rerollMission({ missionId: id, availableStages })}
                  isClaimingReward={isClaimingReward}
                  isRerollingMission={isRerollingMission}
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
                  onTakePhoto={() => setShowPhotoModal(true)}
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

        {/* The arc tab bar — below the drawer */}
        <SubHeaderBar pinned className="relative !top-0">
          <TabButton label="Care" active={activeDrawer === 'care'} onClick={() => toggleDrawer('care')}>
            <span className="flex items-center gap-1.5">
              <HeartHandshake className="size-4" />
              <span className="text-sm">Care</span>
            </span>
          </TabButton>
          <TabButton label="Items" active={activeDrawer === 'items'} onClick={() => toggleDrawer('items')}>
            <span className="flex items-center gap-1.5">
              <Package className="size-4" />
              <span className="text-sm">Items</span>
            </span>
          </TabButton>
          <TabButton label="Missions" active={activeDrawer === 'missions'} onClick={() => toggleDrawer('missions')}>
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

      {/* ─── Hero Section (always visible below drawer) ─── */}
      <div ref={heroRef} className="relative flex-1 min-h-0 flex flex-col items-center justify-center px-4 sm:px-6 overflow-x-hidden">


        {/* Main Blobbi Visual with stats crown + action buttons */}
        {isActiveFloatingCompanion ? (
          <div className="flex flex-col items-center justify-center gap-6 text-center">
            <Footprints className="size-16 text-muted-foreground/30" />
            <p className="text-muted-foreground text-sm">
              {companion.name} is out exploring right now.
            </p>
            <button
              onClick={handleSetAsCompanion}
              disabled={isUpdatingCompanion}
              className={cn(
                'flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-full text-white font-semibold transition-all duration-300 ease-out',
                'hover:-translate-y-0.5 hover:scale-105 hover:brightness-110 active:scale-95',
                isUpdatingCompanion && 'opacity-50 pointer-events-none',
              )}
              style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899, #f59e0b)' }}
            >
              {isUpdatingCompanion ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <Footprints className="size-5" />
              )}
              <span>Bring {companion.name} home</span>
            </button>
          </div>
        ) : (
          <div className="relative flex flex-col items-center">
            {/* Stats crown — arced above the Blobbi */}
            {(() => {
              const allStats = getVisibleStats(companion.stage).map(stat => ({
                stat,
                value: currentStats[stat] ?? 100,
                status: getStatStatus(companion.stage, stat, currentStats[stat] ?? 100),
                color: STAT_COLOR_MAP[stat],
              }));
              if (allStats.length === 0) return null;

              const count = allStats.length;
              const isSmall = heroWidth < 400;
              const arcSpread = isSmall
                ? (count <= 2 ? 90 : count <= 3 ? 130 : 160)
                : (count <= 2 ? 80 : count <= 3 ? 120 : 160);
              const arcHalf = arcSpread / 2;
              const angles = count === 1
                ? [0]
                : allStats.map((_, i) => -arcHalf + (arcSpread / (count - 1)) * i);

              return (
                <div className="relative flex items-end justify-center w-full mb-14" style={{ height: 48 }}>
                  {allStats.map((s, i) => {
                    const angleDeg = angles[i];
                    const angleRad = (angleDeg * Math.PI) / 180;
                    // Scale radius based on container width: ~140 at 340px, ~210 at 640px+
                    const radius = Math.min(210, Math.max(140, (heroWidth - 340) / (640 - 340) * (210 - 140) + 140));
                    const x = Math.sin(angleRad) * radius;
                    // Inverted: center (cos=1) is highest, edges droop down
                    const y = Math.cos(angleRad) * radius - radius;

                    return (
                      <div
                        key={s.stat}
                        className="absolute transition-all duration-500"
                        style={{
                          transform: `translate(-50%, 0)`,
                          left: `calc(50% + ${x.toFixed(1)}px)`,
                          bottom: `${y.toFixed(1)}px`,
                        }}
                      >
                        <StatIndicator
                          stat={s.stat}
                          value={s.value}
                          color={s.color}
                          status={s.status}
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Blobbi visual */}
            <div
              className="relative transition-all duration-500"
              style={!isSleeping ? {
                animation: `blobbi-bob ${4 - (currentStats.happiness / 100) * 1.5}s ease-in-out infinite, blobbi-sway ${6 - (currentStats.happiness / 100) * 2}s ease-in-out infinite`,
              } : undefined}
            >
              <div className="absolute inset-0 -m-24 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
              <BlobbiStageVisual
                companion={companion}
                size="lg"
                animated={!isSleeping}
                reaction={blobbiReaction}
                recipe={hasDevOverride ? undefined : statusRecipe}
                recipeLabel={hasDevOverride ? undefined : statusRecipeLabel}
                emotion={effectiveEmotion}
                className={isEgg
                  ? 'size-44 min-[400px]:size-52 sm:size-64 md:size-80 lg:size-96'
                  : 'size-64 min-[400px]:size-80 sm:size-96 md:size-[32rem] lg:size-[36rem]'
                }
              />
            </div>

            {/* Blobbi Name — hidden for eggs */}
            {!isEgg && (
              <h2
                className="text-2xl sm:text-3xl font-bold text-center -mt-2"
                style={{ color: companion.visualTraits.baseColor }}
              >
                {companion.name}
              </h2>
            )}
          </div>
        )}

        {/* ── Action circles — below the Blobbi ── */}
        {!isActiveFloatingCompanion && (
          <div className="relative z-10 w-full px-4 sm:px-8 -mt-10 flex items-start justify-between">
            {/* Photo — lower left */}
            <button
              onClick={() => setShowPhotoModal(true)}
              className={cn(
                'flex flex-col items-center gap-1.5 transition-all duration-300 ease-out',
                'hover:-translate-y-1 hover:scale-110 active:scale-95',
              )}
            >
              <div
                className="size-20 sm:size-24 rounded-full flex items-center justify-center text-pink-500"
                style={{
                  background: 'radial-gradient(circle at 40% 35%, color-mix(in srgb, #ec4899 14%, transparent), color-mix(in srgb, #ec4899 4%, transparent) 70%)',
                }}
              >
                <Camera className="size-9 sm:size-10" />
              </div>
              <span className="text-xs font-medium text-muted-foreground">Photo</span>
            </button>

            {/* Companion — lower right */}
            {canBeCompanion && (
              <button
                onClick={handleSetAsCompanion}
                disabled={isUpdatingCompanion}
                className={cn(
                  'flex flex-col items-center gap-1.5 transition-all duration-300 ease-out',
                  'hover:-translate-y-1 hover:scale-110 active:scale-95',
                  isUpdatingCompanion && 'opacity-50',
                )}
              >
                <div
                  className={cn('size-20 sm:size-24 rounded-full flex items-center justify-center', isCurrentCompanion ? 'text-emerald-500' : 'text-violet-500')}
                  style={{
                    background: isCurrentCompanion
                      ? 'radial-gradient(circle at 40% 35%, color-mix(in srgb, #10b981 14%, transparent), color-mix(in srgb, #10b981 4%, transparent) 70%)'
                      : 'radial-gradient(circle at 40% 35%, color-mix(in srgb, #8b5cf6 14%, transparent), color-mix(in srgb, #8b5cf6 4%, transparent) 70%)',
                  }}
                >
                  {isUpdatingCompanion ? (
                    <Loader2 className="size-9 sm:size-10 animate-spin" />
                  ) : (
                    <Footprints className="size-9 sm:size-10" />
                  )}
                </div>
                <span className="text-xs font-medium text-muted-foreground">
                  {isCurrentCompanion ? 'With you' : 'Take along'}
                </span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* ─── Inline Activity Area (music/sing — floats above tabs) ─── */}
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

      {/* Tab content is now rendered in the drawer above */}
      
      {/* ─── Dialogs (only for things that genuinely need modals) ─── */}

      {/* Inventory Action Confirmation Modal (Feed/Play/Clean) */}
      {inventoryAction && (
        <BlobbiActionInventoryModal
          open={!!inventoryAction}
          onOpenChange={(open) => !open && setInventoryAction(null)}
          action={inventoryAction}
          companion={companion}
          profile={profile}
          onUseItem={handleUseItem}
          onOpenShop={handleOpenShopFromAction}
          isUsingItem={isUsingItem}
          usingItemId={usingItemId}
        />
      )}
      
      {/* Track Picker Modal */}
      <PlayMusicModal
        open={showTrackPickerModal}
        onOpenChange={setShowTrackPickerModal}
        onConfirm={handleTrackSelected}
        isLoading={isDirectActionPending}
      />
      
      {/* Blobbi Post Modal - for hatch or evolve task */}
      <BlobbiPostModal
        open={showPostModal}
        onOpenChange={setShowPostModal}
        blobbiName={companion.name}
        process={isEvolvingState ? 'evolve' : 'hatch'}
        onSuccess={refetchCurrentTasks}
      />
      
      {/* Blobbi Photo Modal */}
      <BlobbiPhotoModal
        open={showPhotoModal}
        onOpenChange={setShowPhotoModal}
        companion={companion}
      />


      {/* Hatch Ceremony — portaled to document.body to escape center column stacking context */}
      {showHatchCeremony && isEgg && createPortal(
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

// ─── Care Tab Content ─────────────────────────────────────────────────────────

interface CareTabContentProps {
  isEgg: boolean;
  isSleeping: boolean;
  onOpenItems: () => void;
  onDirectAction: (action: DirectAction) => void;
  onRest: () => void;
  actionInProgress: string | null;
  isPublishing: boolean;
}

function CareTabContent({
  isEgg,
  isSleeping,
  onOpenItems,
  onDirectAction,
  onRest,
  actionInProgress,
  isPublishing,
}: CareTabContentProps) {
  const isDisabled = isPublishing || actionInProgress !== null;

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[210px]">
      <div className="flex items-center justify-center gap-3 min-[400px]:gap-6 sm:gap-10">
        <CareActionButton
          icon={<Package className="size-10 sm:size-12" />}
          statIcon={<Sparkles className="size-3.5" />}
          label="Items"
          description="Feed, clean & heal"
          color="text-sky-500"
          onClick={onOpenItems}
          disabled={isDisabled}
        />

        <CareActionButton
          icon={<Music className="size-10 sm:size-12" />}
          statIcon={<Heart className="size-3.5" />}
          label="Music"
          description="Play a tune"
          color="text-pink-500"
          onClick={() => onDirectAction('play_music')}
          disabled={isDisabled}
        />

        <CareActionButton
          icon={<Mic className="size-10 sm:size-12" />}
          statIcon={<Heart className="size-3.5" />}
          label="Sing"
          description="Sing together"
          color="text-purple-500"
          onClick={() => onDirectAction('sing')}
          disabled={isDisabled}
        />

        {!isEgg && (
          <CareActionButton
            icon={
              actionInProgress === 'rest' ? (
                <Loader2 className="size-10 sm:size-12 animate-spin" />
              ) : isSleeping ? (
                <Sun className="size-10 sm:size-12" />
              ) : (
                <Moon className="size-10 sm:size-12" />
              )
            }
            statIcon={<Zap className="size-3.5" />}
            label={isSleeping ? 'Wake' : 'Sleep'}
            description={isSleeping ? 'Rise and shine' : 'Rest & recharge'}
            color={isSleeping ? 'text-amber-500' : 'text-violet-500'}
            onClick={onRest}
            disabled={isDisabled}
          />
        )}
      </div>
    </div>
  );
}

// ─── Care Action Button ───────────────────────────────────────────────────────

function CareActionButton({
  icon,
  statIcon,
  label,
  description,
  color,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  statIcon: React.ReactNode;
  label: string;
  description: string;
  color: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex flex-col items-center gap-1.5 transition-all duration-300 ease-out',
        'hover:-translate-y-2 hover:scale-105 active:scale-95',
        disabled && 'opacity-40 pointer-events-none',
      )}
    >
      <div className="relative">
        <div
          className={cn('size-16 min-[400px]:size-20 sm:size-24 rounded-full flex items-center justify-center', color)}
          style={{
            background: 'radial-gradient(circle at 40% 35%, color-mix(in srgb, currentColor 14%, transparent), color-mix(in srgb, currentColor 5%, transparent) 70%)',
          }}
        >
          {icon}
        </div>
        <div className="absolute -bottom-1 -right-1 size-7 rounded-full flex items-center justify-center bg-background ring-2 ring-background">
          <span className="text-muted-foreground">{statIcon}</span>
        </div>
      </div>
      <span className={cn('text-sm font-semibold', color)}>{label}</span>
      <span className="text-[10px] leading-tight text-muted-foreground/70">{description}</span>
    </button>
  );
}

// ─── Items Tab Content ────────────────────────────────────────────────────────

/** Lucide icon + color for each item category */
function ItemTypeIndicator({ type }: { type: string }) {
  switch (type) {
    case 'food':
      return <Utensils className="size-4 text-amber-400" strokeWidth={4} />;
    case 'toy':
      return <Gamepad2 className="size-4 text-rose-400" strokeWidth={4} />;
    case 'medicine':
      return <Heart className="size-4 text-emerald-400" strokeWidth={4} />;
    case 'hygiene':
      return <Droplets className="size-4 text-sky-400" strokeWidth={4} />;
    default:
      return null;
  }
}

interface ItemsTabContentProps {
  allShopItems: ShopItem[];
  onUseItem: (itemId: string) => void;
  isUsingItem: boolean;
  usingItemId: string | null;
}

function ItemsTabContent({
  allShopItems,
  onUseItem,
  isUsingItem,
  usingItemId,
}: ItemsTabContentProps) {
  return (
    <div className="grid grid-cols-4 sm:grid-cols-5 gap-0.5">
      {allShopItems.filter(i => i.status !== 'disabled').map((item) => {
        const isThisUsing = isUsingItem && usingItemId === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onUseItem(item.id)}
            disabled={isUsingItem}
            className={cn(
              'group relative flex flex-col items-center justify-center gap-0.5 py-3 rounded-2xl transition-all duration-200',
              'hover:bg-accent/50 hover:-translate-y-0.5 active:scale-[0.93] active:translate-y-0',
              isThisUsing && 'bg-accent/40 -translate-y-0.5',
              isUsingItem && !isThisUsing && 'opacity-40 pointer-events-none',
            )}
          >
            {/* Stat category indicator — top-right */}
            <span className="absolute top-1.5 right-2 opacity-60 group-hover:opacity-100 transition-opacity">
              <ItemTypeIndicator type={item.type} />
            </span>
            <span className="text-4xl leading-none transition-transform duration-200 group-hover:scale-110">{item.icon}</span>
            <span className="text-[10px] text-muted-foreground font-medium truncate w-full text-center px-1">{item.name}</span>
            {isThisUsing && <Loader2 className="size-3 animate-spin text-primary absolute bottom-1" />}
          </button>
        );
      })}
    </div>
  );
}

// ─── Missions Tab Content ─────────────────────────────────────────────────────

interface MissionsTabContentProps {
  companion: BlobbiCompanion;
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
  onOpenPostModal: () => void;
  dailyMissions: ReturnType<typeof useDailyMissions>;
  onClaimReward: (id: string) => void;
  onRerollMission: (id: string) => void;
  isClaimingReward: boolean;
  isRerollingMission: boolean;
  canStartIncubation: boolean;
  canStartEvolution: boolean;
  isStartingIncubation: boolean;
  isStartingEvolution: boolean;
  onStartIncubation: () => void;
  onStartEvolution: () => void;
}

type QuestPane = 'journey' | 'bounties';

function MissionsTabContent({
  companion: _companion,
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
  onOpenPostModal,
  dailyMissions,
  onClaimReward,
  onRerollMission: _onRerollMission,
  isClaimingReward,
  isRerollingMission: _isRerollingMission,
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
  const dailyCompleted = missions.filter(m => m.claimed).length;
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
                  case 'open_modal': if (task.actionTarget === 'blobbi_post') onOpenPostModal(); break;
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

            {!dailyMissions.noMissionsAvailable && missions.map(mission => {
              const canClaim = mission.completed && !mission.claimed;
              return (
                <div
                  key={mission.id}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all',
                    canClaim && 'bg-amber-500/[0.06]',
                  )}
                >
                  <DailyMissionIcon action={mission.action} claimed={mission.claimed} canClaim={canClaim} />
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-sm font-medium leading-tight', mission.claimed && 'text-muted-foreground line-through')}>{mission.title}</p>
                    <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">{mission.description}</p>
                  </div>
                  {!mission.claimed && (
                    <span className="text-[10px] tabular-nums font-medium text-muted-foreground shrink-0">{mission.currentCount}/{mission.requiredCount}</span>
                  )}
                  {canClaim && (
                    <button
                      onClick={() => onClaimReward(mission.id)}
                      disabled={isClaimingReward}
                      className="shrink-0 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline"
                    >
                      Claim
                    </button>
                  )}
                </div>
              );
            })}

            {/* Bonus row */}
            {!dailyMissions.noMissionsAvailable && dailyMissions.bonusAvailable && !dailyMissions.bonusClaimed && (
              <div className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-amber-500/[0.06]">
                <div className="size-8 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0">
                  <Sparkles className="size-4 text-amber-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-tight">Daily Champion</p>
                  <p className="text-[10px] text-muted-foreground">All missions complete!</p>
                </div>
                <button
                  onClick={() => onClaimReward('bonus_daily_complete')}
                  disabled={isClaimingReward}
                  className="shrink-0 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline"
                >
                  Claim
                </button>
              </div>
            )}

            {!dailyMissions.noMissionsAvailable && dailyCompleted === dailyTotal && dailyTotal > 0 && dailyMissions.bonusClaimed && (
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

function DailyMissionIcon({ action, claimed, canClaim }: { action: string; claimed: boolean; canClaim: boolean }) {
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
      claimed ? 'bg-emerald-500/15 text-emerald-500' : canClaim ? 'bg-amber-500/15 text-amber-500' : 'bg-muted/60 text-muted-foreground',
    )}>
      {claimed ? <Check className="size-4" /> : icon}
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
  onTakePhoto: () => void;
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
  onTakePhoto,
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
                  <BlobbiStageVisual companion={c} size="sm" />
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

// ─── Stat Indicator ───────────────────────────────────────────────────────────

interface StatIndicatorProps {
  stat: string;
  value: number | undefined;
  color: 'orange' | 'yellow' | 'green' | 'blue' | 'violet';
  status?: 'normal' | 'warning' | 'critical';
}

const STAT_COLORS: Record<string, string> = {
  orange: 'text-orange-500',
  yellow: 'text-yellow-500',
  green: 'text-green-500',
  blue: 'text-blue-500',
  violet: 'text-violet-500',
};

const STAT_BG_COLORS: Record<string, string> = {
  orange: 'bg-orange-500/10',
  yellow: 'bg-yellow-500/10',
  green: 'bg-green-500/10',
  blue: 'bg-blue-500/10',
  violet: 'bg-violet-500/10',
};

const STAT_RING_HEX: Record<string, string> = {
  orange: '#f97316',
  yellow: '#eab308',
  green: '#22c55e',
  blue: '#3b82f6',
  violet: '#8b5cf6',
};

/** Lucide icon component for each stat */
const STAT_ICON_MAP: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  hunger: Utensils,
  happiness: Gamepad2,
  health: Heart,
  hygiene: Droplets,
  energy: Zap,
};

function StatIndicator({ stat, value, color, status = 'normal' }: StatIndicatorProps) {
  const displayValue = value ?? 0;
  const isLow = status === 'warning' || status === 'critical';
  const ringHex = STAT_RING_HEX[color];
  const IconComponent = STAT_ICON_MAP[stat];

  return (
    <div className={cn(
      'relative size-[4.5rem] sm:size-20 rounded-full flex items-center justify-center',
      STAT_BG_COLORS[color],
      status === 'critical' && 'animate-pulse',
    )}>
      {/* Progress ring */}
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 36 36">
        <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-muted/15" />
        <circle
          cx="18" cy="18" r="15" fill="none" strokeWidth="2.5" strokeLinecap="round"
          stroke={ringHex}
          strokeDasharray={`${displayValue * 0.94} 100`}
          className="transition-all duration-500"
        />
      </svg>
      {/* Icon with warning badge on its corner */}
      <div className="relative">
        {IconComponent && <IconComponent className={cn('size-6 sm:size-7', STAT_COLORS[color])} strokeWidth={2.5} />}
        {isLow && (
          <AlertTriangle
            className={cn('absolute -top-1.5 -right-2 size-3.5', status === 'critical' ? 'text-red-500' : 'text-amber-500')}
            strokeWidth={3}
          />
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


