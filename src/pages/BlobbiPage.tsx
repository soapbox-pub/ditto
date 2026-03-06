import { useState, useCallback, useMemo, useEffect } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Egg, Moon, Sun, Eye, EyeOff, Loader2, Sparkles, RefreshCw, ArrowLeftRight, Check } from 'lucide-react';

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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/**
 * Get the localStorage key for the selected Blobbi.
 * User-scoped: blobbi:selected:d:<pubkey>
 */
function getSelectedBlobbiKey(pubkey: string): string {
  return `blobbi:selected:d:${pubkey}`;
}

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
        <div className="size-20 rounded-3xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
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
  
  // STEP 1: Build dList from profile.has[] + currentCompanion
  const dList = useMemo(() => {
    if (!profile) return undefined;
    
    // Build unique list: profile.has[] + currentCompanion (if not already in list)
    const allDs = new Set<string>(profile.has);
    if (profile.currentCompanion && !allDs.has(profile.currentCompanion)) {
      allDs.add(profile.currentCompanion);
    }
    
    const result = Array.from(allDs);
    
    // Debug log as specified
    console.log('[Blobbi] dList:', result);
    
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
      console.log('[Blobbi] Using localStorage selection:', storedSelectedD);
      return storedSelectedD;
    }
    
    // Priority 2: First item from profile.has that exists in companionsByD
    for (const d of profile.has) {
      if (companionsByD[d]) {
        console.log('[Blobbi] Using first valid from profile.has:', d);
        return d;
      }
    }
    
    // Priority 3: No valid selection
    console.log('[Blobbi] No valid selection found');
    return undefined;
  }, [profile, storedSelectedD, companionsByD]);
  
  // Auto-save selection to localStorage when it changes
  useEffect(() => {
    if (selectedD && selectedD !== storedSelectedD) {
      console.log('[Blobbi] Auto-saving selection to localStorage:', selectedD);
      setStoredSelectedD(selectedD);
    }
  }, [selectedD, storedSelectedD, setStoredSelectedD]);
  
  // Get the selected companion from the collection
  const companion = selectedD ? companionsByD[selectedD] ?? null : null;
  
  // STEP 7: Debug log to confirm which Blobbi is rendered
  useEffect(() => {
    if (companion) {
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
    console.log('[Blobbi] User selected:', d);
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
    return <LoadingState />;
  }
  
  // Case D: No profile exists → show "Initialize Blobbonaut"
  if (!profile) {
    return (
      <main className="flex flex-col items-center justify-center p-6 gap-6 min-h-[60vh]">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm">
          <div className="size-24 rounded-3xl bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 flex items-center justify-center">
            <Sparkles className="size-12 text-primary" />
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
      </main>
    );
  }
  
  // Profile exists, but dList is empty (no pets in profile.has and no currentCompanion)
  // Case C: Profile exists but no pets → show "Create Egg"
  if (!dList || dList.length === 0) {
    return (
      <main className="flex flex-col items-center justify-center p-6 gap-6 min-h-[60vh]">
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
      </main>
    );
  }
  
  // We have dList, wait for collection to load
  if (companionLoading) {
    return <LoadingState />;
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
      <main className="flex flex-col items-center justify-center p-6 gap-6 min-h-[60vh]">
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
      </main>
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
  
  // Case A: Profile exists and companion exists → Render the Blobbi
  return (
    <main className="container max-w-2xl mx-auto p-4 pb-20 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Egg className="size-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Blobbi</h1>
            <p className="text-sm text-muted-foreground">Your virtual companion</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(profileFetching || companionFetching) && (
            <RefreshCw className="size-4 text-muted-foreground animate-spin" />
          )}
          
          {/* STEP 8: Switch Blobbi Button */}
          {companions.length > 1 && (
            <Dialog open={showSelector} onOpenChange={setShowSelector}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1">
                  <ArrowLeftRight className="size-3" />
                  Switch
                </Button>
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
                      onSelect={() => handleSelectBlobbi(c.d)}
                      isSelected={c.d === selectedD}
                    />
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          )}
          
          <Badge variant={companion.state === 'sleeping' ? 'secondary' : 'default'}>
            {companion.state === 'sleeping' ? (
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
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="p-4">
            <p className="text-sm text-amber-600 dark:text-amber-400">
              This pet uses an older format. It will be automatically upgraded on your next interaction.
            </p>
          </CardContent>
        </Card>
      )}
      
      {/* Companion Display */}
      <BlobbiDisplay
        companion={companion}
        onRest={handleRest}
        onToggleVisibility={handleToggleVisibility}
        actionInProgress={actionInProgress}
        isPublishing={isPublishing}
      />
    </main>
  );
}

// ─── Blobbi Display ───────────────────────────────────────────────────────────

interface BlobbiDisplayProps {
  companion: BlobbiCompanion;
  onRest: () => void;
  onToggleVisibility: () => void;
  actionInProgress: string | null;
  isPublishing: boolean;
}

function BlobbiDisplay({
  companion,
  onRest,
  onToggleVisibility,
  actionInProgress,
  isPublishing,
}: BlobbiDisplayProps) {
  const isSleeping = companion.state === 'sleeping';
  
  return (
    <div className="space-y-4">
      {/* Main Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col items-center gap-4">
            {/* Egg Visual */}
            <div
              className={cn(
                'size-32 rounded-full flex items-center justify-center transition-all duration-500',
                'bg-gradient-to-br from-amber-100 via-orange-50 to-yellow-100',
                'dark:from-amber-900/30 dark:via-orange-900/20 dark:to-yellow-900/30',
                'border-4 border-amber-200 dark:border-amber-800',
                'shadow-lg shadow-amber-200/50 dark:shadow-amber-900/30',
                isSleeping && 'opacity-70'
              )}
            >
              <Egg
                className={cn(
                  'size-16 text-amber-500 transition-transform duration-1000',
                  !isSleeping && 'animate-pulse'
                )}
              />
            </div>
            
            {/* Name & Stage */}
            <div className="text-center">
              <h2 className="text-xl font-bold">{companion.name}</h2>
              <p className="text-sm text-muted-foreground capitalize">
                {companion.stage} Blobbi
              </p>
            </div>
            
            {/* Visibility Badge */}
            <Badge variant="outline" className="gap-1">
              {companion.visibleToOthers ? (
                <>
                  <Eye className="size-3" />
                  Visible
                </>
              ) : (
                <>
                  <EyeOff className="size-3" />
                  Hidden
                </>
              )}
            </Badge>
          </div>
        </CardContent>
      </Card>
      
      {/* Stats Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">Stats</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <StatBar label="Hunger" value={companion.stats.hunger} color="bg-orange-500" />
          <StatBar label="Happiness" value={companion.stats.happiness} color="bg-yellow-500" />
          <StatBar label="Health" value={companion.stats.health} color="bg-green-500" />
          <StatBar label="Hygiene" value={companion.stats.hygiene} color="bg-blue-500" />
          <StatBar label="Energy" value={companion.stats.energy} color="bg-purple-500" />
        </CardContent>
      </Card>
      
      {/* Actions */}
      <div className="flex gap-3">
        <Button
          onClick={onRest}
          disabled={isPublishing || actionInProgress !== null}
          variant={isSleeping ? 'default' : 'secondary'}
          className="flex-1"
        >
          {actionInProgress === 'rest' ? (
            <Loader2 className="size-4 mr-2 animate-spin" />
          ) : isSleeping ? (
            <Sun className="size-4 mr-2" />
          ) : (
            <Moon className="size-4 mr-2" />
          )}
          {isSleeping ? 'Wake Up' : 'Rest'}
        </Button>
        
        <Button
          onClick={onToggleVisibility}
          disabled={isPublishing || actionInProgress !== null}
          variant="outline"
          className="flex-1"
        >
          {actionInProgress === 'visibility' ? (
            <Loader2 className="size-4 mr-2 animate-spin" />
          ) : companion.visibleToOthers ? (
            <EyeOff className="size-4 mr-2" />
          ) : (
            <Eye className="size-4 mr-2" />
          )}
          {companion.visibleToOthers ? 'Hide' : 'Show'}
        </Button>
      </div>
      
      {/* Info */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <InfoItem label="Generation" value={companion.generation?.toString() ?? '1'} />
            <InfoItem label="Experience" value={companion.experience?.toString() ?? '0'} />
            <InfoItem label="Care Streak" value={`${companion.careStreak ?? 0} days`} />
            <InfoItem
              label="Last Interaction"
              value={formatTimeAgo(companion.lastInteraction)}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Stat Bar ─────────────────────────────────────────────────────────────────

interface StatBarProps {
  label: string;
  value: number | undefined;
  color: string;
}

function StatBar({ label, value, color }: StatBarProps) {
  const displayValue = value ?? 0;
  
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{displayValue}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', color)}
          style={{ width: `${displayValue}%` }}
        />
      </div>
    </div>
  );
}

// ─── Info Item ────────────────────────────────────────────────────────────────

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
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
    <main className="container max-w-2xl mx-auto p-4 pb-20 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Egg className="size-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Choose Your Blobbi</h1>
            <p className="text-sm text-muted-foreground">Select a companion to care for</p>
          </div>
        </div>
        {isLoading && (
          <RefreshCw className="size-4 text-muted-foreground animate-spin" />
        )}
      </div>
      
      {/* Blobbi List */}
      <div className="grid gap-4">
        {companions.map((companion) => (
          <BlobbiSelectorCard
            key={companion.d}
            companion={companion}
            onSelect={() => onSelect(companion.d)}
          />
        ))}
      </div>
    </main>
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
    <Card 
      className={cn(
        'cursor-pointer transition-all hover:border-primary/50 hover:shadow-md',
        isSelected && 'border-primary ring-2 ring-primary/20'
      )}
      onClick={onSelect}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          {/* Blobbi Visual */}
          <div
            className={cn(
              'size-16 rounded-full flex items-center justify-center shrink-0',
              'bg-gradient-to-br from-amber-100 via-orange-50 to-yellow-100',
              'dark:from-amber-900/30 dark:via-orange-900/20 dark:to-yellow-900/30',
              'border-2 border-amber-200 dark:border-amber-800',
              isSleeping && 'opacity-70'
            )}
          >
            <Egg className={cn(
              'size-8 text-amber-500',
              !isSleeping && 'animate-pulse'
            )} />
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
      </CardContent>
    </Card>
  );
}

// ─── Loading State ────────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <main className="container max-w-2xl mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
      
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col items-center gap-4">
            <Skeleton className="size-32 rounded-full" />
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 w-16" />
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="p-6 space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="flex justify-between">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-8" />
              </div>
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    </main>
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
