import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSeoMeta } from '@unhead/react';
import { nip19 } from 'nostr-tools';
import { Egg, RefreshCw, Footprints, Plus } from 'lucide-react';

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
import { BlobbiStageVisual } from '@/blobbi/ui/BlobbiStageVisual';
import { BlobbiHatchingCeremony } from '@/blobbi/onboarding/components/BlobbiHatchingCeremony';
import { BlobbiPhotoModal } from '@/blobbi/ui/BlobbiPhotoModal';
import { useBlobbiCompanionData } from '@/blobbi/companion/hooks/useBlobbiCompanionData';
import { useLayoutOptions } from '@/contexts/LayoutContext';
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



import {
  PlayMusicModal,
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
import { getLiveShopItems } from '@/blobbi/shop/lib/blobbi-shop-items';
import { BlobbiOnboardingFlow } from '@/blobbi/onboarding';
import { useBlobbiActionsRegistration, type UseItemFunction } from '@/blobbi/companion/interaction';
import { BlobbiDevEditor, useBlobbiDevUpdate, type BlobbiDevUpdates, BlobbiEmotionPanel, useEffectiveEmotion, isLocalhostDev, ProgressionDevPanel } from '@/blobbi/dev';
import { useStatusReaction } from '@/blobbi/ui/hooks/useStatusReaction';
import { buildSleepingRecipe } from '@/blobbi/ui/lib/recipe';
import { getActionEmotion, type ActionType } from '@/blobbi/ui/lib/status-reactions';
import type { BlobbiEmotion } from '@/blobbi/ui/lib/emotions';
import { BlobbiRoomShell } from '@/blobbi/rooms/components/BlobbiRoomShell';
import type { BlobbiRoomContext } from '@/blobbi/rooms/lib/room-types';



/**
 * Get the localStorage key for the selected Blobbi.
 * User-scoped: blobbi:selected:d:<pubkey>
 */
function getSelectedBlobbiKey(pubkey: string): string {
  return `blobbi:selected:d:${pubkey}`;
}

/** Enable debug logging in development only */
const DEBUG_BLOBBI = import.meta.env.DEV;



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

      const event = await publishEvent({
        kind: KIND_BLOBBI_STATE,
        content: canonical.content,
        tags: newTags,
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
  // IMPORTANT: The ceremony decision is based on actual companion stages,
  // NOT the onboardingDone flag alone. This handles inconsistent accounts
  // where onboardingDone may be true despite the user never having hatched.
  //
  // Ceremony decision tree:
  // 1. No profile → ceremony (brand new user, creates profile + egg)
  // 2. Profile with no pets (empty has[]) → ceremony (creates egg)
  // 3. Profile with pets → wait for companions to load, then:
  //    a. Any baby/adult exists → skip ceremony (dashboard)
  //    b. Only eggs exist → ceremony with existingCompanion (reuses egg)
  //    c. No companions resolved (stale refs) → ceremony (creates egg)
  const [ceremonyInProgress, setCeremonyInProgress] = useState(false);
  // Set to true once the companion-stage check has resolved so it doesn't
  // re-run on every render as companion data updates.
  const [ceremonyCheckDone, setCeremonyCheckDone] = useState(false);
  // Locks the egg chosen for the ceremony so a page refresh mid-animation
  // doesn't switch to a different egg or create a new one.
  const ceremonyEggRef = useRef<BlobbiCompanion | null>(null);
  
  // Cases that definitely need ceremony (no need to wait for companions)
  const definitelyNeedsCeremony = !profile || !dList || dList.length === 0;
  // Cases where we must inspect actual companion stages before deciding.
  // This fires for ALL users with pets — regardless of onboardingDone —
  // so that accounts with onboardingDone=true but only eggs still get
  // the ceremony.
  const pendingCeremonyCheck = !definitelyNeedsCeremony && !!profile && !ceremonyCheckDone;
  // Whether we've finished loading enough data to make the decision
  const companionDataReady = !companionLoading && (!companionFetching || companions.length > 0);
  
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
          content: profile.event.content,
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
      // Profile has pet d-tags but none resolved (stale references) — treat as new user
      if (DEBUG_BLOBBI) console.log('[BlobbiPage] Starting ceremony: no companions resolved');
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
  // heroWidth measurement: uses a callback ref so the ResizeObserver
  // automatically re-attaches when the hero element unmounts/remounts
  // (which happens on every room switch since each room renders its own hero).
  const heroRef = useRef<HTMLDivElement>(null);
  const [heroWidth, setHeroWidth] = useState(375);
  const roRef = useRef<ResizeObserver | null>(null);

  const heroCallbackRef = useCallback((node: HTMLDivElement | null) => {
    // Disconnect previous observer
    if (roRef.current) {
      roRef.current.disconnect();
      roRef.current = null;
    }
    // Update the ref object so ctx.heroRef still works
    (heroRef as React.MutableRefObject<HTMLDivElement | null>).current = node;

    if (node) {
      setHeroWidth(node.clientWidth);
      const ro = new ResizeObserver(([entry]) => setHeroWidth(entry.contentRect.width));
      ro.observe(node);
      roRef.current = ro;
    }
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
  
  // DEV ONLY: Progression panel state
  const [showProgressionPanel, setShowProgressionPanel] = useState(false);
  
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
  
  // Sync hatch task completions hook
  const { mutateAsync: syncTaskCompletions } = useSyncTaskCompletions({
    companion,
    ensureCanonicalBeforeAction,
    updateCompanionEvent,
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
        content: profile.event.content,
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
  
  // ─── Daily Missions (for missions tab) ───
  const dailyMissions = useDailyMissions({ availableStages });
  const { mutate: claimReward, isPending: isClaimingReward } = useClaimMissionReward(
    profile,
    updateProfileEvent,
    companion,
    updateCompanionEvent,
  );
  // Handle using an item from the items tab / room carousel
  const handleUseItemFromTab = useCallback((itemId: string) => {
    const action = getActionForItem(itemId);
    if (!action || isUsingItem) return;
    setUsingItemId(itemId);
    setActionOverrideEmotion(getActionEmotion(action as ActionType));
    onUseItem(itemId, action).finally(() => {
      setUsingItemId(null);
      setTimeout(() => setActionOverrideEmotion(null), 1500);
    });
  }, [isUsingItem, onUseItem]);

  // ─── Build Room Context ───
  // This is the single object that flows into BlobbiRoomShell → individual rooms.
  // It mirrors everything the old tab components consumed but centralised.
  const roomCtx = useMemo<BlobbiRoomContext>(() => ({
    // Core data
    companion,
    companions,
    selectedD,
    profile,

    // Projected / visual state
    currentStats,
    isSleeping,
    isEgg,
    isBaby,

    // Visual recipe
    statusRecipe,
    statusRecipeLabel,
    effectiveEmotion,
    hasDevOverride,
    blobbiReaction,

    // Item use
    onUseItem,
    handleUseItemFromTab,
    isUsingItem,
    usingItemId,
    allShopItems: getLiveShopItems(),

    // Direct actions
    onDirectAction,
    handleDirectAction,
    isDirectActionPending,

    // Inline activity
    inlineActivity,
    setInlineActivity,
    setBlobbiReaction,
    setActionOverrideEmotion,
    showTrackPickerModal,
    setShowTrackPickerModal,
    handleTrackSelected,
    handleConfirmSing,
    handleCloseInlineActivity,
    handleMusicPlaybackStart,
    handleMusicPlaybackStop,
    handleSingRecordingStart,
    handleSingRecordingStop,
    handleChangeTrack,

    // Rest / sleep
    onRest,
    actionInProgress,
    isPublishing,

    // Companion toggle
    isCurrentCompanion,
    canBeCompanion,
    isUpdatingCompanion,
    isActiveFloatingCompanion,
    handleSetAsCompanion,

    // Photo
    showPhotoModal,
    setShowPhotoModal,

    // Blobbi selector
    onSelectBlobbi,

    // Incubation / Evolution / Tasks
    isIncubating,
    isEvolvingState,
    canStartIncubation,
    canStartEvolution,
    isStartingIncubation,
    isStartingEvolution,
    isStoppingIncubation,
    isStoppingEvolution,
    isHatching,
    isEvolving,
    hatchTasks,
    evolveTasks,
    onStartIncubation: handleStartIncubation,
    onStartEvolution: handleStartEvolution,
    onStopIncubation: handleStopIncubation,
    onStopEvolution: handleStopEvolution,
    onHatch: async () => setShowHatchCeremony(true),
    onEvolve,
    showPostModal,
    setShowPostModal,
    refetchCurrentTasks,

    // Daily missions
    dailyMissions,
    onClaimReward: (id: string) => claimReward({ missionId: id }),
    isClaimingReward,
    availableStages,

    // Adoption
    showAdoptionFlow,
    setShowAdoptionFlow,

    // Adoption + Profile update props
    publishEvent,
    updateProfileEvent,
    updateCompanionEvent,
    invalidateProfile,
    invalidateCompanion,
    setStoredSelectedD,
    ensureCanonicalBeforeAction,

    // Naddr link
    blobbiNaddr,

    // Hero measurement
    heroRef: heroCallbackRef,
    heroWidth,

    // DEV
    showDevEditor,
    setShowDevEditor,
    onDevEditorApply,
    isDevUpdating,
    showEmotionPanel,
    setShowEmotionPanel,
    showProgressionPanel,
    setShowProgressionPanel,
    showHatchCeremony,
    setShowHatchCeremony,

    // Inventory modal
    inventoryAction,
    setInventoryAction,

    // Last feed timestamp (for poop system — use lastInteraction as proxy)
    lastFeedTimestamp: companion.lastInteraction ? companion.lastInteraction * 1000 : undefined,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [
    // Only the primitive/memoized deps that actually change.
    // Stable callbacks (useCallback) and setState refs are intentionally omitted.
    companion, companions, selectedD, profile,
    currentStats, isSleeping, isEgg, isBaby,
    statusRecipe, statusRecipeLabel, effectiveEmotion, hasDevOverride, blobbiReaction,
    isUsingItem, usingItemId, isDirectActionPending,
    inlineActivity, showTrackPickerModal,
    actionInProgress, isPublishing,
    isCurrentCompanion, canBeCompanion, isUpdatingCompanion, isActiveFloatingCompanion,
    showPhotoModal,
    isIncubating, isEvolvingState, canStartIncubation, canStartEvolution,
    isStartingIncubation, isStartingEvolution, isStoppingIncubation, isStoppingEvolution,
    isHatching, isEvolving, hatchTasks, evolveTasks,
    showPostModal, refetchCurrentTasks,
    dailyMissions, isClaimingReward, availableStages,
    showAdoptionFlow,
    blobbiNaddr, heroWidth,
    showDevEditor, isDevUpdating, showEmotionPanel, showProgressionPanel, showHatchCeremony,
    inventoryAction,
  ]);
  
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

      {/* ─── Room-based Layout ─── */}
      <BlobbiRoomShell ctx={roomCtx} />

      {/* ─── Global Dialogs (shared across all rooms) ─── */}
      
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

      {/* Hatch Ceremony — portaled to document.body */}
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
      
      {/* DEV ONLY: Progression Tester */}
      {import.meta.env.DEV && (
        <ProgressionDevPanel
          isOpen={showProgressionPanel}
          onClose={() => setShowProgressionPanel(false)}
          onProfileUpdated={updateProfileEvent}
        />
      )}
    </DashboardShell>
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


