import { useState, useCallback, useMemo, useEffect } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Egg, Moon, Sun, Eye, EyeOff, Loader2, RefreshCw, Check, Info, Users, Target, ShoppingBag, Package, Sparkles, HeartHandshake, Plus, Footprints, Camera, PictureInPicture2, ArrowLeft, AlertTriangle } from 'lucide-react';
// Note: Eye/EyeOff kept for BlobbiSelectorCard visibility badge display
// Note: Sparkles kept for BlobbiBottomBar center action button
// Note: Plus kept for AdoptAnotherBlobbiCard
// Note: AlertTriangle kept for stat warning indicators

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useProjectedBlobbiState } from '@/hooks/useProjectedBlobbiState';
import { useAppContext } from '@/hooks/useAppContext';
import { useBlobbonautProfile } from '@/hooks/useBlobbonautProfile';
import { useBlobbonautProfileNormalization } from '@/hooks/useBlobbonautProfileNormalization';
import { useBlobbisCollection } from '@/hooks/useBlobbisCollection';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useBlobbiMigration } from '@/hooks/useBlobbiMigration';
import { toast } from '@/hooks/useToast';

import { LoginArea } from '@/components/auth/LoginArea';
import { Button } from '@/components/ui/button';

import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { BlobbiStageVisual } from '@/blobbi/ui/BlobbiStageVisual';
import { cn } from '@/lib/utils';

import {
  KIND_BLOBBI_STATE,
  updateBlobbiTags,
  type BlobbiCompanion,
  type BlobbonautProfile,
} from '@/lib/blobbi';

import { applyBlobbiDecay } from '@/lib/blobbi-decay';

import { BlobbiShopModal } from '@/blobbi/shop/components/BlobbiShopModal';
import { BlobbiInventoryModal } from '@/blobbi/shop/components/BlobbiInventoryModal';
import {
  BlobbiActionsModal, 
  BlobbiActionInventoryModal,
  PlayMusicModal,
  InlineMusicPlayer,
  InlineSingCard,
  BlobbiPostModal,
  StartIncubationDialog,
  BlobbiMissionsModal,
  useBlobbiUseInventoryItem,
  useBlobbiHatch,
  useBlobbiEvolve,
  useBlobbiDirectAction,
  useStartIncubation,
  useStopIncubation,
  useSyncHatchTaskCompletions,
  useHatchTasks,
  getInteractionCount,
  createMusicActivity,
  createSingActivity,
  createNoActivity,
  getActionForItem,
  type InventoryAction,
  type DirectAction,
  type InlineActivityState,
  type AudioSource,
  type BlobbiReactionState,
  type StartIncubationMode,
} from '@/blobbi/actions';
import { BlobbiOnboardingFlow } from '@/blobbi/onboarding';

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
    isFetching: profileFetching,
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
      const newTags = updateBlobbiTags(canonical.allTags, {
        state: newState,
        hunger: decayResult.stats.hunger.toString(),
        happiness: decayResult.stats.happiness.toString(),
        health: decayResult.stats.health.toString(),
        hygiene: decayResult.stats.hygiene.toString(),
        energy: decayResult.stats.energy.toString(),
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
      isFetching={profileFetching || companionFetching}
      profile={profile}
      onHatch={handleHatch}
      onEvolve={handleEvolve}
      isHatching={isHatching}
      isEvolving={isEvolving}
      updateProfileEvent={updateProfileEvent}
      updateCompanionEvent={updateCompanionEvent}
      invalidateProfile={invalidateProfile}
      invalidateCompanion={invalidateCompanion}
      setStoredSelectedD={setStoredSelectedD}
      ensureCanonicalBeforeAction={ensureCanonicalBeforeAction}
    />
  );
}

// ─── Dashboard Shell ──────────────────────────────────────────────────────────

interface DashboardShellProps {
  children: React.ReactNode;
}

function DashboardShell({ children }: DashboardShellProps) {
  return (
    <main className="min-h-[calc(100vh-4rem)] px-2 py-4 pb-20 sm:px-4 md:px-6">
      {/* Responsive container: narrow on mobile, wider on desktop with reasonable max */}
      <div className="mx-auto w-full max-w-2xl lg:max-w-3xl">
        {/* Frosted glass dashboard container */}
        <div className="relative rounded-2xl bg-card/80 backdrop-blur-sm border border-border overflow-hidden min-h-[70vh]">
          {/* Subtle decorative gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-muted/50 via-transparent to-muted/30 pointer-events-none" />
          
          {/* Content wrapper */}
          <div className="relative z-10 h-full flex flex-col min-h-[70vh]">
            {children}
          </div>
        </div>
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
  isFetching: boolean;
  profile: BlobbonautProfile | null;
  // Stage transition handlers
  onHatch: () => Promise<void>;
  onEvolve: () => Promise<void>;
  isHatching: boolean;
  isEvolving: boolean;
  // Adoption flow props
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
    profileStorage: import('@/lib/blobbi').StorageItem[];
  } | null>;
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
  isFetching,
  profile,
  onHatch,
  onEvolve,
  isHatching,
  isEvolving,
  updateProfileEvent,
  updateCompanionEvent,
  invalidateProfile,
  invalidateCompanion,
  setStoredSelectedD,
  ensureCanonicalBeforeAction,
}: BlobbiDashboardProps) {
  const isSleeping = companion.state === 'sleeping';
  const isEgg = companion.stage === 'egg';
  
  // Projected state with decay applied (UI-only, recalculates every 60s)
  const projectedState = useProjectedBlobbiState(companion);
  
  // Modal states for bottom bar
  const [showActionsModal, setShowActionsModal] = useState(false);
  const [showMissionsModal, setShowMissionsModal] = useState(false);
  const [showShopModal, setShowShopModal] = useState(false);
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  
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
  
  // Incubation state detection
  const isIncubating = companion.state === 'incubating';
  const canStartIncubation = isEgg && !isIncubating && companion.state !== 'evolving';
  
  // Hatch tasks hook - only active when incubating
  const interactionCount = getInteractionCount(companion);
  const hatchTasks = useHatchTasks(
    isIncubating ? companion : null,
    interactionCount
  );
  
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
  
  // Sync hatch task completions hook
  const { mutateAsync: syncTaskCompletions } = useSyncHatchTaskCompletions({
    companion,
    ensureCanonicalBeforeAction,
    updateCompanionEvent,
    invalidateCompanion,
    invalidateProfile,
  });
  
  // Memoize the completion state to prevent unnecessary sync triggers
  // This creates a stable string that only changes when actual completions change
  const completedTaskIds = useMemo(() => {
    if (!hatchTasks.tasks.length) return '';
    return hatchTasks.tasks
      .filter(t => t.completed)
      .map(t => t.id)
      .sort()
      .join(',');
  }, [hatchTasks.tasks]);
  
  // Memoize cached completion state for comparison
  const cachedCompletedIds = useMemo(() => {
    if (!companion) return '';
    return [...companion.tasksCompleted].sort().join(',');
  }, [companion]);
  
  // Sync task completions only when there's an actual diff
  // CRITICAL: This effect must be stable and idempotent
  useEffect(() => {
    // Skip if still loading or no tasks
    if (hatchTasks.isLoading || !hatchTasks.tasks.length) return;
    
    // Skip if no completed tasks
    if (!completedTaskIds) return;
    
    // Skip if computed matches cached (no diff)
    if (completedTaskIds === cachedCompletedIds) {
      if (DEBUG_BLOBBI) {
        console.log('[BlobbiPage] Task sync skipped: no diff', {
          computed: completedTaskIds,
          cached: cachedCompletedIds,
        });
      }
      return;
    }
    
    if (DEBUG_BLOBBI) {
      console.log('[BlobbiPage] Task sync triggered:', {
        computed: completedTaskIds,
        cached: cachedCompletedIds,
      });
    }
    
    // Convert hatch tasks to sync format
    const tasksToSync = hatchTasks.tasks.map(task => ({
      taskId: task.id,
      completed: task.completed,
    }));
    
    syncTaskCompletions(tasksToSync).catch(err => {
      // Silent fail - this is just a cache sync
      console.warn('Failed to sync task completions:', err);
    });
  }, [completedTaskIds, cachedCompletedIds, hatchTasks.tasks, hatchTasks.isLoading, syncTaskCompletions]);
  
  // Handler for starting incubation with explicit mode from dialog
  const handleStartIncubation = async (mode: StartIncubationMode, stopOtherD?: string) => {
    try {
      await startIncubation({ mode, stopOtherD });
      setShowIncubationDialog(false);
    } catch (error) {
      console.error('Failed to start incubation:', error);
    }
  };
  
  // Handler for stopping incubation
  const handleStopIncubation = async () => {
    await stopIncubation();
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
  const handleTrackSelected = async (source: AudioSource) => {
    setShowTrackPickerModal(false);
    
    // Check if we're changing an existing track (already published) or selecting initial track
    const isChangingTrack = inlineActivity.type === 'music' && inlineActivity.isPublished;
    
    if (isChangingTrack) {
      // Just update the source, keep isPublished: true
      // The InlineMusicPlayer will detect the URL change and reload
      setInlineActivity(prev => 
        prev.type === 'music' ? { ...prev, source } : prev
      );
    } else {
      // Initial track selection - need to publish the action
      setInlineActivity(createMusicActivity(source));
      
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
  };
  
  // Handle music playback state changes (for Blobbi reaction)
  const handleMusicPlaybackStart = () => {
    setBlobbiReaction('listening');
  };
  
  const handleMusicPlaybackStop = () => {
    setBlobbiReaction('idle');
  };
  
  // Handle sing recording state changes (for Blobbi reaction)
  const handleSingRecordingStart = () => {
    setBlobbiReaction('singing');
  };
  
  const handleSingRecordingStop = () => {
    setBlobbiReaction('idle');
  };
  
  // Handle opening track picker to change track (from inline player)
  const handleChangeTrack = () => {
    setShowTrackPickerModal(true);
  };
  
  // Handle using an item (with optional quantity)
  const handleUseItem = async (itemId: string, quantity: number = 1) => {
    if (!inventoryAction || isUsingItem) return;
    setUsingItemId(itemId);
    try {
      await onUseItem(itemId, inventoryAction, quantity);
      // Close the modal on success
      setInventoryAction(null);
    } finally {
      setUsingItemId(null);
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
    try {
      await onUseItem(itemId, action, quantity);
      // Close the inventory modal on success
      setShowInventoryModal(false);
    } finally {
      setUsingItemId(null);
    }
  };
  
  return (
    <DashboardShell>
      {/* Header Row */}
      <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Egg className="size-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Blobbi</h1>
            <p className="text-xs text-muted-foreground">Your virtual companion</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {isFetching && (
            <RefreshCw className="size-4 text-muted-foreground animate-spin" />
          )}
          
          <Badge variant={isSleeping ? 'secondary' : 'default'}>
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
      
      {/* Legacy Migration Notice */}
      {companion.isLegacy && (
        <div className="mx-4 mt-4 sm:mx-6 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <p className="text-sm text-amber-600 dark:text-amber-400">
            This pet uses an older format. It will be automatically upgraded on your next interaction.
          </p>
        </div>
      )}
      
      {/* Hero Section */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 sm:px-6">
        {/* Floating Dashboard Controls */}
        <BlobbiDashboardFloatingControls
          stage={companion.stage}
          onSetAsCompanion={() => console.log('TODO: set as companion')}
          onTakePhoto={() => console.log('TODO: take photo')}
          onOpenPiP={() => console.log('TODO: open PiP')}
          onEvolve={
            // For eggs not yet incubating: show incubation dialog
            // For eggs incubating with all tasks complete: hatch action handled in HatchTasksPanel
            // For baby: evolve to adult
            canStartIncubation
              ? () => setShowIncubationDialog(true)
              : isEgg
                ? onHatch
                : onEvolve
          }
          isTransitioning={isHatching || isEvolving || isStartingIncubation}
          onInfo={() => setShowInfoModal(true)}
          // Hide hatch button only when actively incubating (hatch is in HatchTasksPanel instead)
          // Show button for eggs not yet incubating (to start incubation)
          hideEvolveButton={isIncubating}
          // When canStartIncubation is true, the button triggers incubation start
          isIncubationAction={canStartIncubation}
        />
        
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
        <div className={cn(
          "relative transition-all duration-500",
          isSleeping && "opacity-80"
        )}>
          {/* Subtle glow effect behind the egg */}
          <div className="absolute inset-0 -m-8 bg-primary/5 rounded-full blur-3xl" />
          
          <BlobbiStageVisual
            companion={companion}
            size="lg"
            animated={!isSleeping}
            reaction={blobbiReaction}
            className="size-48 sm:size-56"
          />
        </div>
        
        {/* Stage Badge */}
        <Badge variant="outline" className="mt-6 capitalize">
          {companion.stage} Stage
        </Badge>
      </div>
      
      {/* Stats Section */}
      <div className="px-4 pb-24 sm:px-6">
        {/* Stats Grid - shows projected decay state */}
        {/* Egg stage shows only 3 stats, baby/adult shows all 5 */}
        {isEgg ? (
          <div className="grid grid-cols-3 gap-3 sm:gap-4 max-w-xs mx-auto">
            <StatIndicator 
              label="Health" 
              value={projectedState?.stats.health ?? companion.stats.health} 
              color="green"
              status={projectedState?.visibleStats.find(s => s.stat === 'health')?.status}
            />
            <StatIndicator 
              label="Hygiene" 
              value={projectedState?.stats.hygiene ?? companion.stats.hygiene} 
              color="blue"
              status={projectedState?.visibleStats.find(s => s.stat === 'hygiene')?.status}
            />
            <StatIndicator 
              label="Happy" 
              value={projectedState?.stats.happiness ?? companion.stats.happiness} 
              color="yellow"
              status={projectedState?.visibleStats.find(s => s.stat === 'happiness')?.status}
            />
          </div>
        ) : (
          <div className="grid grid-cols-5 gap-2 sm:gap-4">
            <StatIndicator 
              label="Hunger" 
              value={projectedState?.stats.hunger ?? companion.stats.hunger} 
              color="orange"
              status={projectedState?.visibleStats.find(s => s.stat === 'hunger')?.status}
            />
            <StatIndicator 
              label="Happy" 
              value={projectedState?.stats.happiness ?? companion.stats.happiness} 
              color="yellow"
              status={projectedState?.visibleStats.find(s => s.stat === 'happiness')?.status}
            />
            <StatIndicator 
              label="Health" 
              value={projectedState?.stats.health ?? companion.stats.health} 
              color="green"
              status={projectedState?.visibleStats.find(s => s.stat === 'health')?.status}
            />
            <StatIndicator 
              label="Hygiene" 
              value={projectedState?.stats.hygiene ?? companion.stats.hygiene} 
              color="blue"
              status={projectedState?.visibleStats.find(s => s.stat === 'hygiene')?.status}
            />
            <StatIndicator 
              label="Energy" 
              value={projectedState?.stats.energy ?? companion.stats.energy} 
              color="violet"
              status={projectedState?.visibleStats.find(s => s.stat === 'energy')?.status}
            />
          </div>
        )}
        

        
        {/* Inline Activity Area - inside padded container for proper spacing above bottom bar */}
        {inlineActivity.type === 'music' && (
          <div className="mt-6">
            <InlineMusicPlayer
              source={inlineActivity.source}
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
        onInventoryClick={() => setShowInventoryModal(true)}
        blobbiesCount={companions.length}
      />
      
      {/* Blobbi Selector Modal */}
      <Dialog open={showSelector} onOpenChange={setShowSelector}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Your Blobbies</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 pt-2">
            {companions.map((c) => (
              <BlobbiSelectorCard
                key={c.d}
                companion={c}
                onSelect={() => onSelectBlobbi(c.d)}
                isSelected={c.d === selectedD}
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
        hatchTasks={hatchTasks}
        onOpenPostModal={() => setShowPostModal(true)}
        onHatch={onHatch}
        isHatching={isHatching}
        onStopIncubation={handleStopIncubation}
        isStoppingIncubation={isStoppingIncubation}
      />
      
      {/* Shop Modal */}
      <BlobbiShopModal
        open={showShopModal}
        onOpenChange={setShowShopModal}
        profile={profile}
      />
      
      {/* Inventory Modal */}
      <BlobbiInventoryModal
        open={showInventoryModal}
        onOpenChange={setShowInventoryModal}
        profile={profile}
        companion={companion}
        onUseItem={handleUseItemFromInventory}
        isUsingItem={isUsingItem}
      />
      
      {/* Blobbi Info Modal */}
      <BlobbiInfoModal
        open={showInfoModal}
        onOpenChange={setShowInfoModal}
        companion={companion}
      />
      
      {/* Blobbi Post Modal - for hatch task */}
      <BlobbiPostModal
        open={showPostModal}
        onOpenChange={setShowPostModal}
        blobbiName={companion.name}
        process="hatch"
        onSuccess={() => hatchTasks.refetch()}
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

/** Button definition for floating action buttons */
interface FloatingActionDef {
  id: string;
  icon: React.ReactNode;
  tooltip: string;
  onClick: () => void;
  variant?: 'default' | 'accent';
}

interface BlobbiDashboardFloatingControlsProps {
  stage: 'egg' | 'baby' | 'adult';
  onBack?: () => void;
  onSetAsCompanion: () => void;
  onTakePhoto: () => void;
  onOpenPiP: () => void;
  onEvolve: () => void;
  /** Whether a stage transition is in progress (hatch or evolve) */
  isTransitioning?: boolean;
  onInfo: () => void;
  /** Whether to hide the evolve/hatch button (e.g., when incubating) */
  hideEvolveButton?: boolean;
  /** Whether the button should show incubation action (for eggs not yet incubating) */
  isIncubationAction?: boolean;
}

/**
 * Get the appropriate icon for the evolve/hatch button based on stage and incubation state.
 * - egg stage (not incubating): Egg icon (start incubation action)
 * - egg stage (incubating): Egg icon (hatching action)
 * - baby/adult stages: Sparkles icon (evolution/transformation)
 */
function getEvolveIcon(stage: 'egg' | 'baby' | 'adult', _isIncubationAction?: boolean): React.ReactNode {
  if (stage === 'egg') {
    return <Egg className="size-4" />;
  }
  // Sparkles communicates magical transformation, fitting the Blobbi theme
  return <Sparkles className="size-4" />;
}

/**
 * Get the appropriate tooltip for the evolve/hatch button based on stage and incubation state.
 */
function getEvolveTooltip(stage: 'egg' | 'baby' | 'adult', isIncubationAction?: boolean): string {
  if (stage === 'egg') {
    return isIncubationAction ? 'Start Incubation' : 'Hatch';
  }
  return 'Evolve';
}

/**
 * Floating action controls for the Blobbi dashboard.
 * Renders top-left and top-right button clusters.
 */
function BlobbiDashboardFloatingControls({
  stage,
  onBack,
  onSetAsCompanion,
  onTakePhoto,
  onOpenPiP,
  onEvolve,
  isTransitioning = false,
  onInfo,
  hideEvolveButton = false,
  isIncubationAction = false,
}: BlobbiDashboardFloatingControlsProps) {
  // Left-side buttons
  const leftButtons: FloatingActionDef[] = [
    ...(onBack ? [{
      id: 'back',
      icon: <ArrowLeft className="size-4" />,
      tooltip: 'Go Back',
      onClick: onBack,
    }] : []),
  ];

  // Right-side buttons (top cluster)
  const rightButtons: FloatingActionDef[] = [
    {
      id: 'set-companion',
      icon: <Footprints className="size-4" />,
      tooltip: 'Set as Companion',
      onClick: onSetAsCompanion,
    },
    {
      id: 'photo',
      icon: <Camera className="size-4" />,
      tooltip: 'Take a Photo',
      onClick: onTakePhoto,
    },
    {
      id: 'pip',
      icon: <PictureInPicture2 className="size-4" />,
      tooltip: 'Open PiP',
      onClick: onOpenPiP,
    },
    {
      id: 'info',
      icon: <Info className="size-4" />,
      tooltip: 'Blobbi Info',
      onClick: onInfo,
    },
  ];

  // Evolve/Hatch/Incubation button (emphasized, at the bottom of right cluster)
  // Icon and tooltip are stage-aware and incubation-aware
  const evolveButton: FloatingActionDef = {
    id: 'evolve',
    icon: getEvolveIcon(stage, isIncubationAction),
    tooltip: getEvolveTooltip(stage, isIncubationAction),
    onClick: onEvolve,
    variant: 'accent',
  };

  return (
    <>
      {/* Left-side floating buttons */}
      {leftButtons.length > 0 && (
        <div className="absolute top-28 sm:top-32 left-4 sm:left-6 flex flex-col gap-2 z-20">
          {leftButtons.map((btn) => (
            <QuickActionButton
              key={btn.id}
              tooltip={btn.tooltip}
              onClick={btn.onClick}
            >
              {btn.icon}
            </QuickActionButton>
          ))}
        </div>
      )}

      {/* Right-side floating buttons */}
      <div className="absolute top-28 sm:top-32 right-4 sm:right-6 flex flex-col gap-2 z-20">
        {rightButtons.map((btn) => (
          <QuickActionButton
            key={btn.id}
            tooltip={btn.tooltip}
            onClick={btn.onClick}
          >
            {btn.icon}
          </QuickActionButton>
        ))}
        
        {/* Evolve/Hatch button with accent styling */}
        {/* Adults can't evolve further, so hide the button */}
        {/* Also hide when explicitly requested (e.g., during incubation) */}
        {stage !== 'adult' && !hideEvolveButton && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={evolveButton.onClick}
                disabled={isTransitioning}
                className="size-10 rounded-full bg-primary/10 backdrop-blur-sm border-primary/30 hover:bg-primary/20 hover:border-primary/50 transition-all shadow-sm text-primary disabled:opacity-50"
              >
                {isTransitioning ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  evolveButton.icon
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">
              <p>{isTransitioning ? 'Transitioning...' : evolveButton.tooltip}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </>
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
}

function BlobbiSelectorPage({ companions, onSelect, isLoading, onAdopt }: BlobbiSelectorPageProps) {
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
          {companions.map((companion) => (
            <BlobbiSelectorCard
              key={companion.d}
              companion={companion}
              onSelect={() => onSelect(companion.d)}
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
}

function BlobbiSelectorCard({ companion, onSelect, isSelected }: BlobbiSelectorCardProps) {
  const isSleeping = companion.state === 'sleeping';
  
  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full p-4 rounded-xl text-left transition-all',
        'bg-card/60 backdrop-blur-sm',
        'border border-border',
        'hover:border-primary/30 hover:bg-accent/50',
        'hover:shadow-md',
        isSelected && 'border-primary ring-2 ring-primary/20 bg-accent/50'
      )}
    >
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
            <Badge variant="outline" className="text-xs">
              {companion.visibleToOthers ? (
                <>
                  <Eye className="size-3 mr-1" />
                  Visible
                </>
              ) : (
                <>
                  <EyeOff className="size-3 mr-1" />
                  Hidden
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
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-xl" />
          <div className="space-y-1">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
      
      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        <Skeleton className="h-8 w-32 mb-6" />
        <Skeleton className="size-48 sm:size-56 rounded-full" />
        <Skeleton className="h-6 w-24 mt-6 rounded-full" />
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
  onInventoryClick: () => void;
  blobbiesCount?: number;
}

function BlobbiBottomBar({
  onBlobbiesClick,
  onMissionsClick,
  onActionsClick,
  onShopClick,
  onInventoryClick,
  blobbiesCount,
}: BlobbiBottomBarProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-30">
      <div className="container mx-auto max-w-4xl px-4 pb-4">
        <div className="bg-card/95 backdrop-blur-md border border-border rounded-2xl px-3 py-2 shadow-lg">
          {/* 3-column grid: left | center | right */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            {/* Left Group - aligned to end (closer to center) */}
            <div className="flex items-center justify-end gap-1">
              <BottomBarButton onClick={onBlobbiesClick} icon={<Users className="size-4" />} label="Blobbies" badge={blobbiesCount} />
              <BottomBarButton onClick={onMissionsClick} icon={<Target className="size-4" />} label="Missions" />
            </div>
            
            {/* Center Action Button */}
            <button
              onClick={onActionsClick}
              className="flex items-center justify-center size-12 -mt-4 mx-2 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 active:scale-95 transition-all border-4 border-background"
            >
              <HeartHandshake className="size-5" />
            </button>
            
            {/* Right Group - aligned to start (closer to center) */}
            <div className="flex items-center justify-start gap-1">
              <BottomBarButton onClick={onShopClick} icon={<ShoppingBag className="size-4" />} label="Shop" />
              <BottomBarButton onClick={onInventoryClick} icon={<Package className="size-4" />} label="Inventory" />
            </div>
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
  badge?: number;
}

function BottomBarButton({ onClick, icon, label, badge }: BottomBarButtonProps) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl hover:bg-accent/50 active:bg-accent transition-colors min-w-[56px]"
    >
      <div className="relative">
        {icon}
        {badge !== undefined && badge > 1 && (
          <span className="absolute -top-1 -right-2 size-4 flex items-center justify-center text-[10px] font-medium bg-primary text-primary-foreground rounded-full">
            {badge}
          </span>
        )}
      </div>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </button>
  );
}

// ─── Blobbi Info Modal ────────────────────────────────────────────────────────

interface BlobbiInfoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companion: BlobbiCompanion;
}

function BlobbiInfoModal({ open, onOpenChange, companion }: BlobbiInfoModalProps) {
  const isSleeping = companion.state === 'sleeping';
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle style={{ color: companion.visualTraits.baseColor }}>
            {companion.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {/* Blobbi Visual */}
          <div className="flex justify-center">
            <BlobbiStageVisual
              companion={companion}
              size="md"
              animated={!isSleeping}
            />
          </div>
          
          {/* Info Grid */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-muted-foreground text-xs">Stage</p>
              <p className="font-medium capitalize">{companion.stage}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-muted-foreground text-xs">State</p>
              <p className="font-medium capitalize">{companion.state}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-muted-foreground text-xs">Generation</p>
              <p className="font-medium">{companion.generation ?? 1}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-muted-foreground text-xs">Experience</p>
              <p className="font-medium">{companion.experience ?? 0}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-muted-foreground text-xs">Care Streak</p>
              <p className="font-medium">{companion.careStreak ?? 0} days</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-muted-foreground text-xs">Visibility</p>
              <p className="font-medium">{companion.visibleToOthers ? 'Public' : 'Private'}</p>
            </div>
          </div>
          
          {/* Legacy Notice */}
          {companion.isLegacy && (
            <div className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <p className="text-xs text-amber-600 dark:text-amber-400">
                This pet uses a legacy format and will be upgraded on next interaction.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}


