import { useState, useCallback, useMemo, useEffect } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Egg, Moon, Sun, Eye, EyeOff, Loader2, Sparkles, RefreshCw, ArrowLeftRight, Check, Info } from 'lucide-react';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { useBlobbonautProfile } from '@/hooks/useBlobbonautProfile';
import { useBlobbisCollection } from '@/hooks/useBlobbisCollection';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useBlobbiMigration } from '@/hooks/useBlobbiMigration';
import { toast } from '@/hooks/useToast';

import { LoginArea } from '@/components/auth/LoginArea';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { BlobbiEggVisual } from '@/blobbi/ui/BlobbiEggVisual';
import { cn } from '@/lib/utils';

import {
  KIND_BLOBBI_STATE,
  KIND_BLOBBONAUT_PROFILE,
  buildBlobbonautTags,
  buildEggTags,
  generatePetId10,
  getCanonicalBlobbiD,
  updateBlobbiTags,
  updateBlobbonautTags,
  type BlobbiCompanion,
} from '@/lib/blobbi';

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
        <div className="size-20 rounded-3xl bg-gradient-to-br from-purple-500/20 to-pink-500/10 flex items-center justify-center">
          <Egg className="size-10 text-purple-500" />
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
  
  // STEP 6: Selection Priority
  // 1) localStorage selection (if valid and exists in collection)
  // 2) first item from profile.has that exists in companionsByD
  // 3) undefined (show selector)
  const selectedD = useMemo(() => {
    if (!profile) return undefined;
    
    // Priority 1: localStorage selection (if it exists in loaded collection)
    if (storedSelectedD && companionsByD[storedSelectedD]) {
      return storedSelectedD;
    }
    
    // Priority 2: First item from profile.has that exists in companionsByD
    for (const d of profile.has) {
      if (companionsByD[d]) {
        return d;
      }
    }
    
    // Priority 3: No valid selection
    return undefined;
  }, [profile, storedSelectedD, companionsByD]);
  
  // Auto-save selection to localStorage when it changes
  useEffect(() => {
    if (selectedD && selectedD !== storedSelectedD) {
      setStoredSelectedD(selectedD);
    }
  }, [selectedD, storedSelectedD, setStoredSelectedD]);
  
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
  const handleSelectBlobbi = useCallback((d: string) => {
    setStoredSelectedD(d);
    setShowSelector(false);
  }, [setStoredSelectedD]);
  
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
  
  // ─── Initialize Blobbonaut Profile ───
  const handleInitializeProfile = useCallback(async () => {
    if (!user?.pubkey) return;
    
    setActionInProgress('init-profile');
    try {
      const tags = buildBlobbonautTags(user.pubkey);
      const event = await publishEvent({
        kind: KIND_BLOBBONAUT_PROFILE,
        content: '',
        tags,
      });
      
      updateProfileEvent(event);
      toast({ title: 'Profile initialized!', description: 'Welcome to Blobbi!' });
      invalidateProfile();
    } catch (error) {
      console.error('Failed to initialize profile:', error);
      toast({
        title: 'Failed to initialize',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setActionInProgress(null);
    }
  }, [user?.pubkey, publishEvent, updateProfileEvent, invalidateProfile]);
  
  // ─── Create Egg ───
  const handleCreateEgg = useCallback(async () => {
    if (!user?.pubkey || !profile) return;
    
    setActionInProgress('create-egg');
    try {
      const petId = generatePetId10();
      const createdAt = Math.floor(Date.now() / 1000);
      const tags = buildEggTags(user.pubkey, petId, createdAt, 'Egg');
      
      const event = await publishEvent({
        kind: KIND_BLOBBI_STATE,
        content: 'A new Blobbi egg!',
        tags,
        created_at: createdAt,
      });
      
      updateCompanionEvent(event);
      
      // Update profile with current_companion and has tag (with deduplication)
      const newD = getCanonicalBlobbiD(user.pubkey, petId);
      const updatedHas = [...profile.has, newD];
      const profileTags = updateBlobbonautTags(profile.allTags, {
        current_companion: newD,
        has: updatedHas,
      });
      
      const profileEvent = await publishEvent({
        kind: KIND_BLOBBONAUT_PROFILE,
        content: '',
        tags: profileTags,
      });
      
      updateProfileEvent(profileEvent);
      
      toast({ title: 'Egg created!', description: 'Your Blobbi journey begins!' });
      invalidateProfile();
      invalidateCompanion();
    } catch (error) {
      console.error('Failed to create egg:', error);
      toast({
        title: 'Failed to create egg',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setActionInProgress(null);
    }
  }, [user?.pubkey, profile, publishEvent, updateCompanionEvent, updateProfileEvent, invalidateProfile, invalidateCompanion]);
  
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
      
      // Perform the action using the canonical companion
      const now = Math.floor(Date.now() / 1000).toString();
      const newTags = updateBlobbiTags(canonical.allTags, {
        state: newState,
        last_interaction: now,
        last_decay_at: now,
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
  
  // ─── Toggle Visibility (with automatic legacy migration) ───
  const handleToggleVisibility = useCallback(async () => {
    if (!user?.pubkey || !companion) return;
    
    const newVisibility = !companion.visibleToOthers;
    
    setActionInProgress('visibility');
    try {
      // Ensure canonical before action (auto-migrates legacy pets)
      const canonical = await ensureCanonicalBeforeAction();
      if (!canonical) {
        setActionInProgress(null);
        return;
      }
      
      // Perform the action using the canonical companion
      const now = Math.floor(Date.now() / 1000).toString();
      const newTags = updateBlobbiTags(canonical.allTags, {
        visible_to_others: newVisibility.toString(),
        last_interaction: now,
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
        title: newVisibility ? 'Now visible!' : 'Now hidden',
        description: newVisibility
          ? 'Others can see your Blobbi.'
          : 'Your Blobbi is now private.',
      });
    } catch (error) {
      console.error('Failed to toggle visibility:', error);
      toast({
        title: 'Failed to update',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setActionInProgress(null);
    }
  }, [user?.pubkey, companion, ensureCanonicalBeforeAction, publishEvent, updateCompanionEvent, invalidateCompanion, invalidateProfile]);
  
  // ─── Determine UI State ───
  // Priority: Wait for queries to settle before showing "create" states
  
  // Still loading profile? Show loading
  if (profileLoading) {
    return <DashboardLoadingState />;
  }
  
  // Case D: No profile exists → show "Initialize Blobbonaut"
  if (!profile) {
    return (
      <DashboardShell>
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
          <div className="flex flex-col items-center gap-4 text-center max-w-sm">
            <div className="size-24 rounded-3xl bg-gradient-to-br from-purple-500/20 via-pink-500/10 to-purple-500/5 flex items-center justify-center">
              <Sparkles className="size-12 text-purple-500" />
            </div>
            <h1 className="text-2xl font-bold">Welcome to Blobbi!</h1>
            <p className="text-muted-foreground">
              Initialize your Blobbonaut profile to start caring for virtual pets on Nostr.
            </p>
            <Button
              onClick={handleInitializeProfile}
              disabled={isPublishing || actionInProgress !== null}
              size="lg"
              className="mt-2"
            >
              {actionInProgress === 'init-profile' ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  Initializing...
                </>
              ) : (
                'Initialize Blobbonaut'
              )}
            </Button>
          </div>
        </div>
      </DashboardShell>
    );
  }
  
  // Profile exists, but dList is empty (no pets in profile.has and no currentCompanion)
  // Case C: Profile exists but no pets → show "Create Egg"
  if (!dList || dList.length === 0) {
    return (
      <DashboardShell>
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
          <div className="flex flex-col items-center gap-4 text-center max-w-sm">
            <div className="size-24 rounded-3xl bg-gradient-to-br from-amber-500/20 via-orange-500/10 to-yellow-500/5 flex items-center justify-center">
              <Egg className="size-12 text-amber-500" />
            </div>
            <h1 className="text-2xl font-bold">Create Your First Blobbi!</h1>
            <p className="text-muted-foreground">
              Create an egg to begin your Blobbi journey. Watch it grow and care for it!
            </p>
            <Button
              onClick={handleCreateEgg}
              disabled={isPublishing || actionInProgress !== null}
              size="lg"
              className="mt-2"
            >
              {actionInProgress === 'create-egg' ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Egg className="size-4 mr-2" />
                  Create Egg
                </>
              )}
            </Button>
          </div>
        </div>
      </DashboardShell>
    );
  }
  
  // We have dList, wait for collection to load
  if (companionLoading) {
    return <DashboardLoadingState />;
  }
  
  // STEP 7: No valid selection but we have pets → show Blobbi Selector
  // This happens when:
  // - localStorage selection doesn't exist in companionsByD
  // - No item from profile.has exists in companionsByD
  // - But we have loaded companions available
  if (!selectedD && companions.length > 0) {
    return (
      <BlobbiSelectorPage
        companions={companions}
        onSelect={handleSelectBlobbi}
        isLoading={companionFetching}
      />
    );
  }
  
  // dList has items but collection is empty after loading
  // This could mean the pets don't exist on relays yet
  if (!selectedD || companions.length === 0) {
    return (
      <DashboardShell>
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
          <div className="flex flex-col items-center gap-4 text-center max-w-sm">
            <div className="size-24 rounded-3xl bg-gradient-to-br from-muted/30 via-muted/20 to-muted/10 flex items-center justify-center">
              <RefreshCw className={cn(
                "size-12 text-muted-foreground",
                companionFetching && "animate-spin"
              )} />
            </div>
            <h1 className="text-2xl font-bold">Loading your Blobbi...</h1>
            <p className="text-muted-foreground">
              {companionFetching 
                ? 'Fetching your pet data from relays...'
                : 'Your pet data could not be found. You can create a new egg.'}
            </p>
            {!companionFetching && (
              <Button
                onClick={handleCreateEgg}
                disabled={isPublishing || actionInProgress !== null}
                size="lg"
                className="mt-2"
              >
                {actionInProgress === 'create-egg' ? (
                  <>
                    <Loader2 className="size-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Egg className="size-4 mr-2" />
                    Create New Egg
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </DashboardShell>
    );
  }
  
  // Selected companion not found in collection (shouldn't happen, but safety check)
  if (!companion) {
    return (
      <BlobbiSelectorPage
        companions={companions}
        onSelect={handleSelectBlobbi}
        isLoading={companionFetching}
      />
    );
  }
  
  // Case A: Profile exists and companion exists → Render the Blobbi Dashboard
  return (
    <BlobbiDashboard
      companion={companion}
      companions={companions}
      selectedD={selectedD}
      showSelector={showSelector}
      setShowSelector={setShowSelector}
      onSelectBlobbi={handleSelectBlobbi}
      onRest={handleRest}
      onToggleVisibility={handleToggleVisibility}
      actionInProgress={actionInProgress}
      isPublishing={isPublishing}
      isFetching={profileFetching || companionFetching}
    />
  );
}

// ─── Dashboard Shell ──────────────────────────────────────────────────────────

interface DashboardShellProps {
  children: React.ReactNode;
}

function DashboardShell({ children }: DashboardShellProps) {
  return (
    <main className="min-h-[calc(100vh-4rem)] p-4 pb-20">
      <div className="container mx-auto max-w-4xl">
        {/* Frosted glass dashboard container */}
        <div className="relative rounded-2xl bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border border-white/50 dark:border-gray-700/50 border-t-2 border-t-purple-300 dark:border-t-purple-600 overflow-hidden min-h-[70vh]">
          {/* Decorative gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-purple-50/80 via-pink-50/40 to-purple-50/80 dark:from-purple-900/20 dark:via-pink-900/10 dark:to-purple-900/20 pointer-events-none" />
          
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
  onToggleVisibility: () => void;
  actionInProgress: string | null;
  isPublishing: boolean;
  isFetching: boolean;
}

function BlobbiDashboard({
  companion,
  companions,
  selectedD,
  showSelector,
  setShowSelector,
  onSelectBlobbi,
  onRest,
  onToggleVisibility,
  actionInProgress,
  isPublishing,
  isFetching,
}: BlobbiDashboardProps) {
  const isSleeping = companion.state === 'sleeping';
  
  return (
    <DashboardShell>
      {/* Header Row */}
      <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-purple-200/50 dark:border-purple-800/30">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
            <Egg className="size-5 text-purple-500" />
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
          
          <Badge 
            variant={isSleeping ? 'secondary' : 'default'}
            className={cn(
              "text-xs",
              !isSleeping && "bg-purple-500 hover:bg-purple-600"
            )}
          >
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
        {/* Floating Quick Actions */}
        <div className="absolute top-20 right-4 sm:right-6 flex flex-col gap-2 z-20">
          {companions.length > 1 && (
            <Dialog open={showSelector} onOpenChange={setShowSelector}>
              <DialogTrigger asChild>
                <QuickActionButton tooltip="Switch Blobbi">
                  <ArrowLeftRight className="size-4" />
                </QuickActionButton>
              </DialogTrigger>
              <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Switch Blobbi</DialogTitle>
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
                </div>
              </DialogContent>
            </Dialog>
          )}
          
          <QuickActionButton
            tooltip={isSleeping ? 'Wake Up' : 'Rest'}
            onClick={onRest}
            disabled={isPublishing || actionInProgress !== null}
            loading={actionInProgress === 'rest'}
          >
            {isSleeping ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </QuickActionButton>
          
          <QuickActionButton
            tooltip={companion.visibleToOthers ? 'Hide' : 'Show'}
            onClick={onToggleVisibility}
            disabled={isPublishing || actionInProgress !== null}
            loading={actionInProgress === 'visibility'}
          >
            {companion.visibleToOthers ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </QuickActionButton>
        </div>
        
        {/* Blobbi Name */}
        <div className="flex items-center gap-2 mb-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-center">{companion.name}</h2>
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="text-muted-foreground hover:text-foreground transition-colors">
                <Info className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="capitalize">{companion.stage} Blobbi</p>
              <p className="text-xs text-muted-foreground">
                {companion.visibleToOthers ? 'Visible to others' : 'Hidden from others'}
              </p>
            </TooltipContent>
          </Tooltip>
        </div>
        
        {/* Main Blobbi Visual */}
        <div className={cn(
          "relative transition-all duration-500",
          isSleeping && "opacity-80"
        )}>
          {/* Glow effect behind the egg */}
          <div className="absolute inset-0 -m-8 bg-gradient-to-br from-purple-400/20 via-pink-400/20 to-purple-400/20 rounded-full blur-3xl" />
          
          <BlobbiEggVisual
            companion={companion}
            size="lg"
            animated={!isSleeping}
            className="size-48 sm:size-56"
          />
        </div>
        
        {/* Stage Badge */}
        <Badge variant="outline" className="mt-6 capitalize">
          {companion.stage} Stage
        </Badge>
      </div>
      
      {/* Stats & Info Section */}
      <div className="px-4 pb-6 sm:px-6 space-y-4">
        {/* Stats Grid */}
        <div className="grid grid-cols-5 gap-2 sm:gap-4">
          <StatIndicator label="Hunger" value={companion.stats.hunger} color="orange" />
          <StatIndicator label="Happy" value={companion.stats.happiness} color="yellow" />
          <StatIndicator label="Health" value={companion.stats.health} color="green" />
          <StatIndicator label="Hygiene" value={companion.stats.hygiene} color="blue" />
          <StatIndicator label="Energy" value={companion.stats.energy} color="purple" />
        </div>
        
        {/* Info Card */}
        <Card className="bg-white/50 dark:bg-gray-800/50 border-purple-200/30 dark:border-purple-700/30">
          <CardContent className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <InfoItem label="Generation" value={companion.generation?.toString() ?? '1'} />
              <InfoItem label="Experience" value={companion.experience?.toString() ?? '0'} />
              <InfoItem label="Care Streak" value={`${companion.careStreak ?? 0} days`} />
              <InfoItem label="Last Active" value={formatTimeAgo(companion.lastInteraction)} />
            </div>
          </CardContent>
        </Card>
      </div>
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
          className="size-10 rounded-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-purple-200/50 dark:border-purple-700/50 hover:border-purple-300 dark:hover:border-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/30 transition-all shadow-sm"
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

// ─── Stat Indicator ───────────────────────────────────────────────────────────

interface StatIndicatorProps {
  label: string;
  value: number | undefined;
  color: 'orange' | 'yellow' | 'green' | 'blue' | 'purple';
}

const STAT_COLORS = {
  orange: 'from-orange-500 to-orange-400',
  yellow: 'from-yellow-500 to-yellow-400',
  green: 'from-green-500 to-green-400',
  blue: 'from-blue-500 to-blue-400',
  purple: 'from-purple-500 to-purple-400',
};

const STAT_BG_COLORS = {
  orange: 'bg-orange-100 dark:bg-orange-900/30',
  yellow: 'bg-yellow-100 dark:bg-yellow-900/30',
  green: 'bg-green-100 dark:bg-green-900/30',
  blue: 'bg-blue-100 dark:bg-blue-900/30',
  purple: 'bg-purple-100 dark:bg-purple-900/30',
};

function StatIndicator({ label, value, color }: StatIndicatorProps) {
  const displayValue = value ?? 0;
  
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={cn(
        "relative size-12 sm:size-14 rounded-full flex items-center justify-center",
        STAT_BG_COLORS[color]
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
            stroke="url(#statGradient)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${displayValue * 0.94} 100`}
            className="transition-all duration-500"
          />
          <defs>
            <linearGradient id="statGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" className={cn("stop-color-current", STAT_COLORS[color].split(' ')[0].replace('from-', 'text-'))} />
              <stop offset="100%" className={cn("stop-color-current", STAT_COLORS[color].split(' ')[1].replace('to-', 'text-'))} />
            </linearGradient>
          </defs>
        </svg>
        <span className="text-xs sm:text-sm font-semibold">{displayValue}</span>
      </div>
      <span className="text-[10px] sm:text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

// ─── Info Item ────────────────────────────────────────────────────────────────

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center sm:text-left">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

// ─── Blobbi Selector Page ─────────────────────────────────────────────────────

interface BlobbiSelectorPageProps {
  companions: BlobbiCompanion[];
  onSelect: (d: string) => void;
  isLoading?: boolean;
}

function BlobbiSelectorPage({ companions, onSelect, isLoading }: BlobbiSelectorPageProps) {
  return (
    <DashboardShell>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-purple-200/50 dark:border-purple-800/30">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
            <Egg className="size-5 text-purple-500" />
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
        'bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm',
        'border border-purple-200/50 dark:border-purple-700/50',
        'hover:border-purple-300 dark:hover:border-purple-600',
        'hover:bg-purple-50/50 dark:hover:bg-purple-900/20',
        'hover:shadow-md',
        isSelected && 'border-purple-500 ring-2 ring-purple-500/20 bg-purple-50/50 dark:bg-purple-900/20'
      )}
    >
      <div className="flex items-center gap-4">
        {/* Blobbi Visual */}
        <div className="shrink-0">
          <BlobbiEggVisual
            companion={companion}
            size="sm"
          />
        </div>
        
        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold truncate">{companion.name}</h3>
            {isSelected && (
              <Check className="size-4 text-purple-500 shrink-0" />
            )}
          </div>
          <p className="text-sm text-muted-foreground capitalize">
            {companion.stage} Blobbi
          </p>
          <div className="flex items-center gap-2 mt-1">
            <Badge 
              variant={isSleeping ? 'secondary' : 'default'} 
              className={cn(
                "text-xs",
                !isSleeping && "bg-purple-500 hover:bg-purple-600"
              )}
            >
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

// ─── Dashboard Loading State ──────────────────────────────────────────────────

function DashboardLoadingState() {
  return (
    <DashboardShell>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-purple-200/50 dark:border-purple-800/30">
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
      <div className="px-4 pb-6 sm:px-6 space-y-4">
        <div className="grid grid-cols-5 gap-2 sm:gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <Skeleton className="size-12 sm:size-14 rounded-full" />
              <Skeleton className="h-3 w-10" />
            </div>
          ))}
        </div>
        
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    </DashboardShell>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimeAgo(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
