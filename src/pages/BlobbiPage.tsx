import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { nip19 } from 'nostr-tools';
import { Egg, Moon, Sun, Loader2, RefreshCw, Check, Target, Package, Sparkles, HeartHandshake, Plus, Camera, ArrowLeft, AlertTriangle, X, Footprints, Wrench, Theater, MoreHorizontal, ExternalLink } from 'lucide-react';
// Note: Sparkles kept for BlobbiBottomBar center action button
// Note: Plus kept for AdoptAnotherBlobbiCard
// Note: AlertTriangle kept for stat warning indicators

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
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { BlobbiStageVisual } from '@/blobbi/ui/BlobbiStageVisual';
import { BlobbiPhotoModal } from '@/blobbi/ui/BlobbiPhotoModal';
import { useBlobbiCompanionData } from '@/blobbi/companion/hooks/useBlobbiCompanionData';
import { cn } from '@/lib/utils';

import {
  KIND_BLOBBI_STATE,
  KIND_BLOBBONAUT_PROFILE,
  updateBlobbiTags,
  updateBlobbonautTags,
  type BlobbiCompanion,
  type BlobbonautProfile,
} from '@/blobbi/core/lib/blobbi';

import { applyBlobbiDecay } from '@/blobbi/core/lib/blobbi-decay';

import { BlobbiShopModal } from '@/blobbi/shop/components/BlobbiShopModal';

import {
  BlobbiActionsModal, 
  BlobbiActionInventoryModal,
  PlayMusicModal,
  InlineMusicPlayer,
  InlineSingCard,
  BlobbiPostModal,
  StartIncubationDialog,
  StartEvolutionDialog,
  BlobbiMissionsModal,
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
  type InventoryAction,
  type DirectAction,
  type InlineActivityState,
  type SelectedTrack,
  type BlobbiReactionState,
  type StartIncubationMode,
} from '@/blobbi/actions';
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
  
  // ─── CASE A: Profile still loading ───
  if (profileLoading) {
    return <DashboardLoadingState />;
  }
  
  // ─── CASE B: No profile exists ───
  // Show profile creation onboarding
  if (!profile) {
    if (DEBUG_BLOBBI) console.log('[BlobbiPage] Showing: profile creation onboarding');
    return (
      <DashboardShell>
        <BlobbiOnboardingFlow
          profile={null}
          updateProfileEvent={updateProfileEvent}
          updateCompanionEvent={updateCompanionEvent}
          invalidateProfile={invalidateProfile}
          invalidateCompanion={invalidateCompanion}
          setStoredSelectedD={setStoredSelectedD}
        />
      </DashboardShell>
    );
  }
  
  // ─── CASE C: Profile exists but has no pets (empty has[] and no current_companion) ───
  // Show adoption onboarding
  if (!dList || dList.length === 0) {
    if (DEBUG_BLOBBI) console.log('[BlobbiPage] Showing: adoption onboarding (profile exists, no pets)');
    return (
      <DashboardShell>
        <BlobbiOnboardingFlow
          profile={profile}
          updateProfileEvent={updateProfileEvent}
          updateCompanionEvent={updateCompanionEvent}
          invalidateProfile={invalidateProfile}
          invalidateCompanion={invalidateCompanion}
          setStoredSelectedD={setStoredSelectedD}
        />
      </DashboardShell>
    );
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
    <main className="px-2 py-2 sm:px-4 md:px-6">
      {/* Responsive container: narrow on mobile, wider on desktop with reasonable max */}
      <div className="mx-auto w-full max-w-2xl lg:max-w-3xl">
        {children}
      </div>
    </main>
  );
}

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
    profileStorage: import('@/blobbi/core/lib/blobbi').StorageItem[];
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
  const isSleeping = companion.state === 'sleeping';
  const isEgg = companion.stage === 'egg';
  
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
  
  // Modal states for bottom bar
  const [showActionsModal, setShowActionsModal] = useState(false);
  const [showMissionsModal, setShowMissionsModal] = useState(false);
  const [showShopModal, setShowShopModal] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  
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
  
  // Inventory action modal state
  const [inventoryAction, setInventoryAction] = useState<InventoryAction | null>(null);
  const [usingItemId, setUsingItemId] = useState<string | null>(null);
  
  // Track selection modal (for changing tracks in music player)
  const [showTrackPickerModal, setShowTrackPickerModal] = useState(false);
  
  // Inline activity state - only one activity can be active at a time
  const [inlineActivity, setInlineActivity] = useState<InlineActivityState>(createNoActivity());
  
  // Blobbi reaction state - drives visual reactions to activities
  // This is passed to BlobbiStageVisual to trigger dance/sway animations
  const [blobbiReaction, setBlobbiReaction] = useState<BlobbiReactionState>('idle');
  
  // Incubation/Hatch task state
  const [showPostModal, setShowPostModal] = useState(false);
  const [showIncubationDialog, setShowIncubationDialog] = useState(false);
  const [showEvolutionDialog, setShowEvolutionDialog] = useState(false);
  
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
  const canBeCompanion = companion.stage === 'baby' || companion.stage === 'adult';
  
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
      setShowIncubationDialog(false);
    } catch (error) {
      console.error('Failed to start incubation:', error);
    }
  };
  
  // Handler for starting evolution
  const handleStartEvolution = async () => {
    try {
      await startEvolution();
      setShowEvolutionDialog(false);
    } catch (error) {
      console.error('Failed to start evolution:', error);
    }
  };
  
  // Handler for stopping incubation
  const handleStopIncubation = async () => {
    await stopIncubation();
    setShowMissionsModal(false);
  };
  
  // Handler for stopping evolution
  const handleStopEvolution = async () => {
    await stopEvolution();
    setShowMissionsModal(false);
  };
  
  // Handle opening an inventory action modal
  const handleInventoryAction = (action: InventoryAction) => {
    setShowActionsModal(false);
    setInventoryAction(action);
  };
  
  // Handle opening a direct action (now opens inline card)
  const handleDirectAction = (action: DirectAction) => {
    setShowActionsModal(false);
    if (action === 'play_music') {
      // Open the track picker modal first
      setShowTrackPickerModal(true);
    } else if (action === 'sing') {
      // Open the inline sing card directly
      // Note: Singing reaction starts when recording actually begins (via onRecordingStart)
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
  
  // Handle opening shop from empty state
  const handleOpenShopFromAction = () => {
    setInventoryAction(null);
    setShowShopModal(true);
  };

  // Handle using item directly from inventory modal
  const handleUseItemFromInventory = async (itemId: string, quantity: number) => {
    // Determine the action type from the item
    const action = getActionForItem(itemId);
    if (!action) return;

    setUsingItemId(itemId);
    // Set action emotion override while item is being used
    setActionOverrideEmotion(getActionEmotion(action as ActionType));
    try {
      await onUseItem(itemId, action, quantity);
      // Close the shop modal on success (inventory is a tab within it)
      setShowShopModal(false);
    } finally {
      setUsingItemId(null);
      // Clear action emotion after a brief delay for visual feedback
      setTimeout(() => setActionOverrideEmotion(null), 1500);
    }
  };
  
  return (
    <DashboardShell>

      
      {/* Legacy Migration Notice */}
      {companion.isLegacy && (
        <div className="mx-4 mt-4 sm:mx-6 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <p className="text-sm text-amber-600 dark:text-amber-400">
            This pet uses an older format. It will be automatically upgraded on your next interaction.
          </p>
        </div>
      )}
      
      {/* Hero Section */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-4 sm:px-6">
        {/* Floating Dashboard Controls */}
        <BlobbiDashboardFloatingControls />
        
        {/* Blobbi Name */}
        <div className="flex items-center gap-2 mb-6">
          <h2
            className="text-2xl sm:text-3xl font-bold text-center"
            style={{ color: companion.visualTraits.baseColor }}
          >
            {companion.name}
          </h2>
        </div>
        
        {/* Main Blobbi Visual */}
        {isActiveFloatingCompanion ? (
          // Show message when Blobbi is active as floating companion
          <div className="flex flex-col items-center justify-center size-48 sm:size-56 text-center">
            <Footprints className="size-12 text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground text-sm">
              {companion.name} is out exploring right now.
            </p>
          </div>
        ) : (
          <div className="relative transition-all duration-500">
            {/* Subtle glow effect behind the egg */}
            <div className="absolute inset-0 -m-8 bg-primary/5 rounded-full blur-3xl" />
            
            <BlobbiStageVisual
              companion={companion}
              size="lg"
              animated={!isSleeping}
              reaction={blobbiReaction}
              recipe={hasDevOverride ? undefined : statusRecipe}
              recipeLabel={hasDevOverride ? undefined : statusRecipeLabel}
              emotion={effectiveEmotion}

              className="size-48 sm:size-56"
            />
          </div>
        )}
        
      </div>
      
      {/* Stats Section */}
      <div className="px-4 sm:px-6">
        {/* Stats Grid - shows projected decay state */}
        {/* Only stats below the visibility threshold are shown (centralized in getVisibleStatsWithValues) */}
        {(() => {
          const visibleStats = (projectedState?.visibleStats ?? []).map(vs => ({
            ...vs,
            label: STAT_LABEL_MAP[vs.stat],
            color: STAT_COLOR_MAP[vs.stat],
          }));
          if (visibleStats.length === 0) return null;
          return (
            <div className={cn(
              "grid gap-2 sm:gap-4",
              visibleStats.length <= 3 ? "max-w-xs mx-auto" : "",
              visibleStats.length === 1 ? "grid-cols-1" : visibleStats.length === 2 ? "grid-cols-2" : visibleStats.length === 3 ? "grid-cols-3" : visibleStats.length === 4 ? "grid-cols-4" : "grid-cols-5",
            )}>
              {visibleStats.map((s) => (
                <StatIndicator
                  key={s.stat}
                  label={s.label}
                  value={s.value}
                  color={s.color}
                  status={s.status}
                />
              ))}
            </div>
          );
        })()}
        

        
        {/* Inline Activity Area - inside padded container for proper spacing above bottom bar */}
        {inlineActivity.type === 'music' && (
          <div className="mt-6">
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
          <div className="mt-6">
            <InlineSingCard
              onConfirm={handleConfirmSing}
              onClose={handleCloseInlineActivity}
              onRecordingStart={handleSingRecordingStart}
              onRecordingStop={handleSingRecordingStop}
              isPublishing={isDirectActionPending}
            />
          </div>
        )}
      </div>
      
      {/* Bottom Action Bar */}
      <BlobbiBottomBar
        onBlobbiesClick={() => setShowSelector(true)}
        onMissionsClick={() => setShowMissionsModal(true)}
        onActionsClick={() => setShowActionsModal(true)}
        onShopClick={() => setShowShopModal(true)}
        needyBlobbiesCount={companions.filter(companionNeedsCare).length}
        isInTaskProcess={isInTaskProcess}
        remainingTasksCount={remainingTasksCount}
        allTasksComplete={allTasksComplete}
        stage={companion.stage}
        blobbiNaddr={blobbiNaddr}
        onSetAsCompanion={handleSetAsCompanion}
        isCurrentCompanion={isCurrentCompanion}
        isUpdatingCompanion={isUpdatingCompanion}
        onTakePhoto={() => setShowPhotoModal(true)}
        onEvolve={
          canStartIncubation
            ? () => setShowIncubationDialog(true)
            : canStartEvolution
              ? () => setShowEvolutionDialog(true)
              : isEgg
                ? onHatch
                : onEvolve
        }
        isTransitioning={isHatching || isEvolving || isStartingIncubation || isStartingEvolution}
        hideEvolveButton={isIncubating || isEvolvingState}
        isIncubationAction={canStartIncubation}
        isEvolutionAction={canStartEvolution}
        onDevInstantTransition={isEgg ? onHatch : isBaby ? onEvolve : undefined}
        onDevOpenEditor={() => setShowDevEditor(true)}
        onDevOpenEmotionPanel={() => setShowEmotionPanel(true)}
      />
      
      {/* Blobbi Selector Modal */}
      <Dialog open={showSelector} onOpenChange={setShowSelector}>
        <DialogContent className="max-w-md w-[calc(100%-2rem)] max-h-[80vh] flex flex-col p-0 gap-0 [&>button:last-child]:hidden">
          {/* Header - Sticky */}
          <DialogHeader className="sticky top-0 z-10 bg-background px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4 border-b">
            <div className="flex items-start justify-between gap-4">
              <DialogTitle className="flex items-center gap-2">
                <Egg className="size-5" />
                Your Blobbies
              </DialogTitle>
              <DialogClose className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 shrink-0">
                <X className="size-5" />
                <span className="sr-only">Close</span>
              </DialogClose>
            </div>
          </DialogHeader>
          {/* Content - Scrollable */}
          <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-3 sm:py-4">
            <div className="grid gap-3">
              {companions.map((c) => (
                <BlobbiSelectorCard
                  key={c.d}
                  companion={c}
                  onSelect={() => onSelectBlobbi(c.d)}
                  isSelected={c.d === selectedD}
                  isCurrentCompanion={c.d === profile?.currentCompanion}
                />
              ))}
              
              {/* Adopt Another Blobbi CTA */}
              <AdoptAnotherBlobbiCard
                onAdopt={() => {
                  setShowSelector(false);
                  setShowAdoptionFlow(true);
                }}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
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
      
      {/* Actions Modal */}
      <BlobbiActionsModal
        open={showActionsModal}
        onOpenChange={setShowActionsModal}
        companion={companion}
        onRest={onRest}
        onInventoryAction={handleInventoryAction}
        onDirectAction={handleDirectAction}
        actionInProgress={actionInProgress}
        isPublishing={isPublishing}
      />
      
      {/* Inventory Action Modal (Feed/Play/Clean) */}
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
      
      {/* Track Picker Modal (for selecting music tracks) */}
      <PlayMusicModal
        open={showTrackPickerModal}
        onOpenChange={setShowTrackPickerModal}
        onConfirm={handleTrackSelected}
        isLoading={isDirectActionPending}
      />
      
      {/* Missions Modal */}
      <BlobbiMissionsModal
        open={showMissionsModal}
        onOpenChange={setShowMissionsModal}
        companion={companion}
        profile={profile}
        updateProfileEvent={updateProfileEvent}
        hatchTasks={hatchTasks}
        evolveTasks={evolveTasks}
        onOpenPostModal={() => setShowPostModal(true)}
        onHatch={onHatch}
        isHatching={isHatching}
        onEvolve={onEvolve}
        isEvolving={isEvolving}
        onStopIncubation={handleStopIncubation}
        isStoppingIncubation={isStoppingIncubation}
        onStopEvolution={handleStopEvolution}
        isStoppingEvolution={isStoppingEvolution}
        availableStages={availableStages}
      />
      
      {/* Shop & Inventory Modal (unified) */}
      <BlobbiShopModal
        open={showShopModal}
        onOpenChange={setShowShopModal}
        profile={profile}
        companion={companion}
        onUseItem={handleUseItemFromInventory}
        isUsingItem={isUsingItem}
      />
      
      {/* Blobbi Post Modal - for hatch or evolve task */}
      <BlobbiPostModal
        open={showPostModal}
        onOpenChange={setShowPostModal}
        blobbiName={companion.name}
        process={isEvolvingState ? 'evolve' : 'hatch'}
        onSuccess={refetchCurrentTasks}
      />
      
      {/* Blobbi Photo Modal - polaroid-style photo capture */}
      <BlobbiPhotoModal
        open={showPhotoModal}
        onOpenChange={setShowPhotoModal}
        companion={companion}
      />
      
      {/* Start Incubation Confirmation Dialog */}
      <StartIncubationDialog
        open={showIncubationDialog}
        onOpenChange={setShowIncubationDialog}
        companion={companion}
        companions={companions}
        onConfirm={handleStartIncubation}
        isPending={isStartingIncubation}
      />
      
      {/* Start Evolution Confirmation Dialog */}
      <StartEvolutionDialog
        open={showEvolutionDialog}
        onOpenChange={setShowEvolutionDialog}
        companion={companion}
        onConfirm={handleStartEvolution}
        isPending={isStartingEvolution}
      />
      
      {/* DEV ONLY: Blobbi State Editor Modal */}
      {import.meta.env.DEV && (
        <BlobbiDevEditor
          isOpen={showDevEditor}
          onClose={() => setShowDevEditor(false)}
          companion={companion}
          onApply={onDevEditorApply}
          isUpdating={isDevUpdating}
        />
      )}
      
      {/* DEV ONLY: Blobbi Emotion Tester Panel */}
      {import.meta.env.DEV && (
        <BlobbiEmotionPanel
          isOpen={showEmotionPanel}
          onClose={() => setShowEmotionPanel(false)}
        />
      )}
    </DashboardShell>
  );
}

// ─── Quick Action Button ──────────────────────────────────────────────────────

interface QuickActionButtonProps {
  children: React.ReactNode;
  tooltip: string;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
}

function QuickActionButton({ children, tooltip, onClick, disabled, loading }: QuickActionButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          onClick={onClick}
          disabled={disabled}
          className="size-10 rounded-full bg-background/80 backdrop-blur-sm border-border hover:bg-accent hover:border-border transition-all shadow-sm"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}

// ─── Dashboard Floating Controls ──────────────────────────────────────────────

/**
 * Get the appropriate tooltip for the evolve/hatch button based on stage and action state.
 */
function getEvolveTooltip(
  stage: 'egg' | 'baby' | 'adult', 
  isIncubationAction?: boolean,
  isEvolutionAction?: boolean
): string {
  if (stage === 'egg') {
    return isIncubationAction ? 'Start Incubation' : 'Hatch';
  }
  if (stage === 'baby') {
    return isEvolutionAction ? 'Start Evolution' : 'Evolve';
  }
  return 'Evolve';
}

/** Floating back button for the Blobbi dashboard. */
function BlobbiDashboardFloatingControls({ onBack }: { onBack?: () => void }) {
  if (!onBack) return null;
  return (
    <div className="absolute top-28 sm:top-32 left-4 sm:left-6 flex flex-col gap-2 z-20">
      <QuickActionButton tooltip="Go Back" onClick={onBack}>
        <ArrowLeft className="size-4" />
      </QuickActionButton>
    </div>
  );
}

// ─── Stat Indicator ───────────────────────────────────────────────────────────

interface StatIndicatorProps {
  label: string;
  value: number | undefined;
  color: 'orange' | 'yellow' | 'green' | 'blue' | 'violet';
  /** Optional status for warning/critical indicators */
  status?: 'normal' | 'warning' | 'critical';
}

// Semantic colors for stats - these represent the stat type, not brand colors
const STAT_COLORS = {
  orange: 'text-orange-500',
  yellow: 'text-yellow-500',
  green: 'text-green-500',
  blue: 'text-blue-500',
  violet: 'text-violet-500',
};

const STAT_BG_COLORS = {
  orange: 'bg-orange-500/10',
  yellow: 'bg-yellow-500/10',
  green: 'bg-green-500/10',
  blue: 'bg-blue-500/10',
  violet: 'bg-violet-500/10',
};

// Status-based ring colors for warning/critical states
const STATUS_RING_COLORS = {
  normal: '', // Use default color
  warning: 'text-amber-500',
  critical: 'text-red-500',
};

function StatIndicator({ label, value, color, status = 'normal' }: StatIndicatorProps) {
  const displayValue = value ?? 0;
  const ringColor = status !== 'normal' ? STATUS_RING_COLORS[status] : STAT_COLORS[color];
  const showWarningIcon = status === 'critical';
  
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={cn(
        "relative size-12 sm:size-14 rounded-full flex items-center justify-center",
        STAT_BG_COLORS[color],
        status === 'critical' && "animate-pulse"
      )}>
        {/* Progress ring */}
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 36 36">
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className="text-muted/20"
          />
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${displayValue * 0.94} 100`}
            className={cn("transition-all duration-500", ringColor)}
          />
        </svg>
        {showWarningIcon ? (
          <AlertTriangle className="size-4 text-red-500" />
        ) : (
          <span className="text-xs sm:text-sm font-semibold">{displayValue}</span>
        )}
      </div>
      <span className={cn(
        "text-[10px] sm:text-xs",
        status === 'critical' ? "text-red-500 font-medium" : 
        status === 'warning' ? "text-amber-500" : 
        "text-muted-foreground"
      )}>
        {label}
      </span>
    </div>
  );
}

// ─── Blobbi Selector Page ─────────────────────────────────────────────────────

interface BlobbiSelectorPageProps {
  companions: BlobbiCompanion[];
  onSelect: (d: string) => void;
  isLoading?: boolean;
  onAdopt?: () => void;
  /** The d-tag of the current companion (for indicator) */
  currentCompanion?: string;
}

function BlobbiSelectorPage({ companions, onSelect, isLoading, onAdopt, currentCompanion }: BlobbiSelectorPageProps) {
  return (
    <DashboardShell>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Egg className="size-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Choose Your Blobbi</h1>
            <p className="text-xs text-muted-foreground">Select a companion to care for</p>
          </div>
        </div>
        {isLoading && (
          <RefreshCw className="size-4 text-muted-foreground animate-spin" />
        )}
      </div>
      
      {/* Blobbi List */}
      <div className="flex-1 p-4 sm:p-6">
        <div className="grid gap-3 max-w-lg mx-auto">
          {companions.map((c) => (
            <BlobbiSelectorCard
              key={c.d}
              companion={c}
              onSelect={() => onSelect(c.d)}
              isCurrentCompanion={c.d === currentCompanion}
            />
          ))}
          
          {/* Adopt Another Blobbi CTA */}
          {onAdopt && (
            <AdoptAnotherBlobbiCard onAdopt={onAdopt} />
          )}
        </div>
      </div>
    </DashboardShell>
  );
}

// ─── Blobbi Selector Card ─────────────────────────────────────────────────────

interface BlobbiSelectorCardProps {
  companion: BlobbiCompanion;
  onSelect: () => void;
  isSelected?: boolean;
  /** Whether this Blobbi is set as the user's current companion */
  isCurrentCompanion?: boolean;
}

function BlobbiSelectorCard({ companion, onSelect, isSelected, isCurrentCompanion }: BlobbiSelectorCardProps) {
  const isSleeping = companion.state === 'sleeping';
  const needsCare = companionNeedsCare(companion);
  
  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full p-4 rounded-xl text-left transition-all relative',
        'bg-card/60 backdrop-blur-sm',
        'border border-border',
        'hover:border-primary/30 hover:bg-accent/50',
        'hover:shadow-md',
        isSelected && 'border-primary ring-2 ring-primary/20 bg-accent/50'
      )}
    >
      {/* Current companion indicator */}
      {isCurrentCompanion && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="absolute top-2 left-2 size-5 rounded-full bg-green-500/20 flex items-center justify-center">
              <Footprints className="size-3.5 text-green-500" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>Current companion</p>
          </TooltipContent>
        </Tooltip>
      )}
      
      {/* Warning indicator for Blobbies needing care */}
      {needsCare && (
        <div className={cn(
          'absolute top-2 size-5 rounded-full bg-amber-500/20 flex items-center justify-center',
          isCurrentCompanion ? 'right-2' : 'right-2'
        )}>
          <AlertTriangle className="size-3.5 text-amber-500" />
        </div>
      )}
      
      <div className="flex items-center gap-4">
        {/* Blobbi Visual */}
        <div className="shrink-0">
          <BlobbiStageVisual
            companion={companion}
            size="sm"
          />
        </div>
        
        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold truncate">{companion.name}</h3>
            {isSelected && (
              <Check className="size-4 text-primary shrink-0" />
            )}
          </div>
          <p className="text-sm text-muted-foreground capitalize">
            {companion.stage} Blobbi
          </p>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant={isSleeping ? 'secondary' : 'default'} className="text-xs">
              {isSleeping ? (
                <>
                  <Moon className="size-3 mr-1" />
                  Sleeping
                </>
              ) : (
                <>
                  <Sun className="size-3 mr-1" />
                  Active
                </>
              )}
            </Badge>
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── Adopt Another Blobbi CTA Card ────────────────────────────────────────────

interface AdoptAnotherBlobbiCardProps {
  onAdopt: () => void;
}

/**
 * CTA card for adopting another Blobbi.
 * Appears at the bottom of the Blobbi selector list.
 */
function AdoptAnotherBlobbiCard({ onAdopt }: AdoptAnotherBlobbiCardProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onAdopt}
          className={cn(
            'w-full p-4 rounded-xl text-center transition-all',
            'bg-primary/5 backdrop-blur-sm',
            'border-2 border-dashed border-primary/20',
            'hover:border-primary/40 hover:bg-primary/10',
            'hover:shadow-md',
            'group'
          )}
        >
          <div className="flex flex-col items-center gap-3 py-2">
            {/* Plus icon in circle */}
            <div className={cn(
              'size-12 rounded-full flex items-center justify-center',
              'bg-primary/10 border border-primary/20',
              'group-hover:bg-primary/20 group-hover:border-primary/30',
              'transition-colors'
            )}>
              <Plus className="size-6 text-primary" />
            </div>
            
            {/* Title */}
            <div className="space-y-1">
              <h3 className="font-semibold text-foreground">
                Adopt Another Blobbi
              </h3>
              <p className="text-sm text-muted-foreground">
                Preview and adopt a new companion
              </p>
            </div>
          </div>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <p>Click to preview and adopt a new Blobbi egg to add to your collection!</p>
      </TooltipContent>
    </Tooltip>
  );
}

// ─── Dashboard Loading State ──────────────────────────────────────────────────

function DashboardLoadingState() {
  return (
    <DashboardShell>
      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-4">
        <Skeleton className="h-8 w-32 mb-6" />
        <Skeleton className="size-48 sm:size-56 rounded-full" />
      </div>
      
      {/* Stats */}
      <div className="px-4 pb-6 sm:px-6">
        <div className="grid grid-cols-5 gap-2 sm:gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <Skeleton className="size-12 sm:size-14 rounded-full" />
              <Skeleton className="h-3 w-10" />
            </div>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}

// ─── Bottom Action Bar ────────────────────────────────────────────────────────

interface BlobbiBottomBarProps {
  onBlobbiesClick: () => void;
  onMissionsClick: () => void;
  onActionsClick: () => void;
  onShopClick: () => void;
  /** Number of Blobbies that need care (any stat below threshold) */
  needyBlobbiesCount?: number;
  /** Whether the current Blobbi is in an active task process (incubating or evolving) */
  isInTaskProcess?: boolean;
  /** Number of remaining (incomplete) persistent tasks */
  remainingTasksCount?: number;
  /** Whether all tasks are complete (show "!" badge) */
  allTasksComplete?: boolean;
  // ── 3-dots menu actions ──
  stage: 'egg' | 'baby' | 'adult';
  blobbiNaddr: string;
  onSetAsCompanion: () => void;
  isCurrentCompanion: boolean;
  isUpdatingCompanion?: boolean;
  onTakePhoto: () => void;
  onEvolve: () => void;
  isTransitioning?: boolean;
  hideEvolveButton?: boolean;
  isIncubationAction?: boolean;
  isEvolutionAction?: boolean;
  // ── Dev-only actions ──
  onDevInstantTransition?: () => void;
  onDevOpenEditor?: () => void;
  onDevOpenEmotionPanel?: () => void;
}

function BlobbiBottomBar({
  onBlobbiesClick,
  onMissionsClick,
  onActionsClick,
  onShopClick,
  needyBlobbiesCount,
  isInTaskProcess,
  remainingTasksCount,
  allTasksComplete,
  // 3-dots menu props
  stage,
  blobbiNaddr,
  onSetAsCompanion,
  isCurrentCompanion,
  isUpdatingCompanion = false,
  onTakePhoto,
  onEvolve,
  isTransitioning = false,
  hideEvolveButton = false,
  isIncubationAction = false,
  isEvolutionAction = false,
  // Dev-only props
  onDevInstantTransition,
  onDevOpenEditor,
  onDevOpenEmotionPanel,
}: BlobbiBottomBarProps) {
  // Determine what to show on missions badge:
  // - If all tasks complete during active process: show "!"
  // - If tasks remaining during active process: show count
  // - Otherwise: no badge
  // Works for BOTH incubating (hatch) and evolving processes
  const missionsBadge = allTasksComplete ? '!' : (isInTaskProcess && remainingTasksCount && remainingTasksCount > 0 ? remainingTasksCount : undefined);

  const canBeCompanion = stage !== 'egg';
  const showEvolveButton = stage !== 'adult' && !hideEvolveButton;
  
  return (
    <div className="mt-6 pt-2">
      <div className="bg-card/95 backdrop-blur-md border border-border rounded-2xl px-1.5 sm:px-3 py-2 shadow-lg overflow-hidden">
        {/* 3-column grid: left | center | right */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-0.5 sm:gap-2">
          {/* Left Group - aligned to end (closer to center) */}
          <div className="flex items-center justify-end gap-0 sm:gap-1 overflow-hidden">
            <BottomBarButton 
              onClick={onBlobbiesClick} 
              icon={<Egg className="size-4" />} 
              label="Blobbies" 
              badge={needyBlobbiesCount && needyBlobbiesCount > 0 ? needyBlobbiesCount : undefined}
              badgeVariant={needyBlobbiesCount && needyBlobbiesCount > 0 ? 'warning' : 'default'}
            />
            <BottomBarButton 
              onClick={onMissionsClick} 
              icon={<Target className="size-4" />} 
              label="Missions" 
              badge={missionsBadge}
              badgeVariant={allTasksComplete ? 'success' : 'default'}
            />
          </div>
          
          {/* Center Action Button */}
          <button
            onClick={onActionsClick}
            className="flex items-center justify-center size-11 sm:size-12 -mt-3 sm:-mt-4 mx-1 sm:mx-2 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 active:scale-95 transition-all border-4 border-background shrink-0"
          >
            <HeartHandshake className="size-4 sm:size-5" />
          </button>
          
          {/* Right Group - aligned to start (closer to center) */}
          <div className="flex items-center justify-start gap-0 sm:gap-1 overflow-hidden">
            <BottomBarButton onClick={onShopClick} icon={<Package className="size-4" />} label="Items" />

            {/* 3-dots menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex flex-col items-center gap-0.5 px-2 sm:px-3 py-1.5 rounded-xl hover:bg-accent/50 active:bg-accent transition-colors min-w-0 sm:min-w-[56px]"
                >
                  <MoreHorizontal className="size-4" />
                  <span className="text-[10px] text-muted-foreground truncate max-w-[48px] sm:max-w-none">More</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="end">
                <DropdownMenuItem onClick={onTakePhoto}>
                  <Camera className="size-4 mr-2" />
                  Take a Photo
                </DropdownMenuItem>
                {canBeCompanion && (
                  <DropdownMenuItem onClick={onSetAsCompanion} disabled={isUpdatingCompanion}>
                    <Footprints className={cn('size-4 mr-2', isCurrentCompanion && 'text-green-500')} />
                    {isCurrentCompanion ? 'Current Companion' : 'Set as Companion'}
                  </DropdownMenuItem>
                )}
                {showEvolveButton && (
                  <DropdownMenuItem onClick={onEvolve} disabled={isTransitioning}>
                    {stage === 'egg' ? <Egg className="size-4 mr-2" /> : <Sparkles className="size-4 mr-2" />}
                    {getEvolveTooltip(stage, isIncubationAction, isEvolutionAction)}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                  <Link to={`/${blobbiNaddr}`}>
                    <ExternalLink className="size-4 mr-2" />
                    View Blobbi
                  </Link>
                </DropdownMenuItem>
                {/* DEV ONLY: Developer tools */}
                {isLocalhostDev() && (onDevInstantTransition || onDevOpenEditor || onDevOpenEmotionPanel) && (
                  <>
                    <DropdownMenuSeparator />
                    {stage !== 'adult' && onDevInstantTransition && (
                      <DropdownMenuItem onClick={onDevInstantTransition} disabled={isTransitioning} className="text-amber-600 dark:text-amber-400">
                        {stage === 'egg' ? <Egg className="size-4 mr-2" /> : <Sparkles className="size-4 mr-2" />}
                        {stage === 'egg' ? 'Dev Hatch' : 'Dev Evolve'}
                      </DropdownMenuItem>
                    )}
                    {onDevOpenEditor && (
                      <DropdownMenuItem onClick={onDevOpenEditor} className="text-amber-600 dark:text-amber-400">
                        <Wrench className="size-4 mr-2" />
                        State Editor
                      </DropdownMenuItem>
                    )}
                    {onDevOpenEmotionPanel && (
                      <DropdownMenuItem onClick={onDevOpenEmotionPanel} className="text-amber-600 dark:text-amber-400">
                        <Theater className="size-4 mr-2" />
                        Emotion Tester
                      </DropdownMenuItem>
                    )}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Bottom Bar Button ────────────────────────────────────────────────────────

interface BottomBarButtonProps {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  /** Badge content - number or string (e.g., "?" for completed tasks) */
  badge?: number | string;
  /** Badge color variant */
  badgeVariant?: 'default' | 'warning' | 'success';
}

function BottomBarButton({ onClick, icon, label, badge, badgeVariant = 'default' }: BottomBarButtonProps) {
  // Determine if badge should show
  const showBadge = badge !== undefined && (typeof badge === 'string' || badge > 0);
  
  // Badge color classes based on variant
  const badgeColorClass = {
    default: 'bg-primary text-primary-foreground',
    warning: 'bg-amber-500 text-white',
    success: 'bg-emerald-500 text-white',
  }[badgeVariant];
  
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-0.5 px-2 sm:px-3 py-1.5 rounded-xl hover:bg-accent/50 active:bg-accent transition-colors min-w-0 sm:min-w-[56px]"
    >
      <div className="relative">
        {icon}
        {showBadge && (
          <span className={cn(
            "absolute -top-1 -right-2 size-4 flex items-center justify-center text-[10px] font-medium rounded-full",
            badgeColorClass
          )}>
            {badge}
          </span>
        )}
      </div>
      <span className="text-[10px] text-muted-foreground truncate max-w-[48px] sm:max-w-none">{label}</span>
    </button>
  );
}




