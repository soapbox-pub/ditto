import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Egg, Footprints, Loader2 } from 'lucide-react';

import { BlobbiAwayState } from '@/blobbi/ui/BlobbiAwayState';
import { BlobbiStageVisual } from '@/blobbi/ui/BlobbiStageVisual';
import { StatIndicator } from '@/blobbi/ui/StatIndicator';
import { useProjectedBlobbiState } from '@/blobbi/core/hooks/useProjectedBlobbiState';
import { useStatusReaction } from '@/blobbi/ui/hooks/useStatusReaction';
import { useBlobbisCollection } from '@/blobbi/core/hooks/useBlobbisCollection';
import { useBlobbiCompanionData } from '@/blobbi/companion/hooks/useBlobbiCompanionData';
import { useBlobbiMigration } from '@/blobbi/core/hooks/useBlobbiMigration';
import { useBlobbiUseInventoryItem } from '@/blobbi/actions/hooks/useBlobbiUseInventoryItem';
import { isActionVisibleForStage, type InventoryAction, type BlobbiAction } from '@/blobbi/actions/lib/blobbi-action-utils';
import { getVisibleStats } from '@/blobbi/core/lib/blobbi-decay';
import { getBlobbiStatDisplayState } from '@/blobbi/core/lib/blobbi-segments';
import { KIND_BLOBBI_STATE, KIND_BLOBBONAUT_PROFILE, updateBlobbiTags, updateBlobbonautTags, filterMigratedLegacyCompanions } from '@/blobbi/core/lib/blobbi';
import { applyBlobbiDecay } from '@/blobbi/core/lib/blobbi-decay';
import { getStreakTagUpdates } from '@/blobbi/actions/lib/blobbi-streak';
import { useBlobbonautProfile } from '@/hooks/useBlobbonautProfile';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { toast } from '@/hooks/useToast';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import type { BlobbiCompanion } from '@/blobbi/core/lib/blobbi';
import type { BlobbiStats } from '@/blobbi/core/types/blobbi';

/** Stat-to-action mapping: each stat has an associated quick action + default item. */
const STAT_ACTION_MAP: Record<string, { itemId: string; action: InventoryAction } | 'sleep'> = {
  hunger: { itemId: 'food_apple', action: 'feed' },
  happiness: { itemId: 'toy_ball', action: 'play' },
  health: { itemId: 'med_vitamins', action: 'medicine' },
  hygiene: { itemId: 'hyg_soap', action: 'clean' },
  energy: 'sleep',
};

/** Stat-to-color mapping matching the BlobbiPage convention. */
const STAT_COLOR_MAP: Record<string, 'orange' | 'yellow' | 'green' | 'blue' | 'violet'> = {
  hunger: 'orange',
  happiness: 'yellow',
  health: 'green',
  hygiene: 'blue',
  energy: 'violet',
};

/** Blobbi action name for stage visibility checks. */
const STAT_ACTION_NAME: Record<string, BlobbiAction> = {
  hunger: 'feed',
  happiness: 'play',
  health: 'medicine',
  hygiene: 'clean',
};

/** localStorage key helper matching BlobbiPage pattern. */
function getSelectedBlobbiKey(pubkey: string): string {
  return `blobbi:selected:d:${pubkey.slice(0, 8)}`;
}

/** Mini Blobbi widget with live stats and quick actions. */
export function BlobbiWidget() {
  const { user } = useCurrentUser();
  const { companions, isLoading, updateCompanionEvent } = useBlobbisCollection();
  const { profile, updateProfileEvent, invalidate: invalidateProfile } = useBlobbonautProfile();
  const { ensureCanonicalBlobbiBeforeAction } = useBlobbiMigration();
  const { mutateAsync: publishEvent } = useNostrPublish();

  // Filter out legacy companions that have been migrated to canonical format
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

  // Match BlobbiPage's selection logic: localStorage > profile.has > first companion
  const localStorageKey = user?.pubkey ? getSelectedBlobbiKey(user.pubkey) : 'blobbi:selected:d:none';
  const [storedSelectedD, setStoredSelectedD] = useLocalStorage<string | null>(localStorageKey, null);

  const companion = useMemo<BlobbiCompanion | null>(() => {
    if (!filteredCompanions || filteredCompanions.length === 0) return null;
    if (storedSelectedD && filteredCompanionsByD[storedSelectedD]) return filteredCompanionsByD[storedSelectedD];
    if (profile) {
      for (const d of profile.has) {
        if (filteredCompanionsByD[d]) return filteredCompanionsByD[d];
      }
    }
    return filteredCompanions[0];
  }, [filteredCompanions, filteredCompanionsByD, storedSelectedD, profile]);

  // Zero-arg wrapper for ensureCanonical (same pattern as BlobbiPage)
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

  // Wire up item action hook
  const { mutateAsync: executeUseItem, isPending: isUsingItem } = useBlobbiUseInventoryItem({
    companion,
    profile,
    ensureCanonicalBeforeAction,
    updateCompanionEvent,
    updateProfileEvent,
  });

  // Sleep/wake handler (same pattern as BlobbiPage)
  const [isSleepPending, setIsSleepPending] = useState(false);
  const handleRest = useCallback(async () => {
    if (!user?.pubkey || !companion) return;
    const isCurrentlySleeping = companion.state === 'sleeping';
    const newState = isCurrentlySleeping ? 'active' : 'sleeping';
    setIsSleepPending(true);
    try {
      const canonical = await ensureCanonicalBeforeAction();
      if (!canonical) return;

      const now = Math.floor(Date.now() / 1000);
      const decayResult = applyBlobbiDecay({
        stage: canonical.companion.stage,
        state: canonical.companion.state,
        stats: canonical.companion.stats,
        lastDecayAt: canonical.companion.lastDecayAt,
        now,
      });

      const nowStr = now.toString();
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
      const event = await publishEvent({ kind: KIND_BLOBBI_STATE, content: canonical.content, tags: newTags, prev });
      updateCompanionEvent(event);
      toast({ title: isCurrentlySleeping ? 'Woke up!' : 'Resting...' });
    } catch {
      toast({ title: 'Action failed', variant: 'destructive' });
    } finally {
      setIsSleepPending(false);
    }
  }, [user?.pubkey, companion, ensureCanonicalBeforeAction, publishEvent, updateCompanionEvent]);

  // Companion toggle handler (same logic as BlobbiPage)
  const [isUpdatingCompanion, setIsUpdatingCompanion] = useState(false);
  const isCurrentCompanion = companion ? profile?.currentCompanion === companion.d : false;
  const { companion: activeCompanion } = useBlobbiCompanionData();
  const isActiveFloatingCompanion = companion ? activeCompanion?.d === companion.d : false;

  const handleSetAsCompanion = useCallback(async () => {
    if (!profile || !companion) return;
    setIsUpdatingCompanion(true);
    try {
      // Fetch fresh profile data from relays to avoid stale-read-then-write
      const canonical = await ensureCanonicalBeforeAction();
      if (!canonical) return;

      let updatedTags: string[][];
      if (isCurrentCompanion) {
        updatedTags = updateBlobbonautTags(canonical.profileAllTags, {})
          .filter(tag => tag[0] !== 'current_companion');
      } else {
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
    } catch {
      toast({ title: 'Failed to update companion', variant: 'destructive' });
    } finally {
      setIsUpdatingCompanion(false);
    }
  }, [profile, companion, isCurrentCompanion, ensureCanonicalBeforeAction, publishEvent, updateProfileEvent, invalidateProfile]);

  const isActionPending = isUsingItem || isSleepPending;

  if (!user) {
    return (
      <Link to="/blobbi" className="flex flex-col items-center gap-2 py-4 hover:bg-secondary/40 rounded-lg transition-colors">
        <div className="size-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Egg className="size-8 text-primary" />
        </div>
        <span className="text-xs text-muted-foreground">Log in to hatch your Blobbi</span>
      </Link>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-3 py-4">
        <Skeleton className="size-24 rounded-full" />
        <div className="flex items-center justify-center gap-1.5 pt-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="size-9 rounded-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!companion) {
    return (
      <Link to="/blobbi" className="flex flex-col items-center gap-2 py-4 hover:bg-secondary/40 rounded-lg transition-colors">
        <div className="size-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Egg className="size-8 text-primary" />
        </div>
        <span className="text-sm font-medium text-primary">Hatch your Blobbi</span>
        <span className="text-xs text-muted-foreground">Get your virtual pet companion</span>
      </Link>
    );
  }

  return (
    <BlobbiWidgetContent
      companion={companion}
      onUseItem={executeUseItem}
      onRest={handleRest}
      isActionPending={isActionPending}
      isCurrentCompanion={isCurrentCompanion}
      isActiveFloatingCompanion={isActiveFloatingCompanion}
      isUpdatingCompanion={isUpdatingCompanion}
      onToggleCompanion={handleSetAsCompanion}
    />
  );
}

interface BlobbiWidgetContentProps {
  companion: BlobbiCompanion;
  onUseItem: (req: { itemId: string; action: InventoryAction }) => Promise<unknown>;
  onRest: () => Promise<void>;
  isActionPending: boolean;
  isCurrentCompanion: boolean;
  isActiveFloatingCompanion: boolean;
  isUpdatingCompanion: boolean;
  onToggleCompanion: () => Promise<void>;
}

function BlobbiWidgetContent({ companion, onUseItem, onRest, isActionPending, isCurrentCompanion, isActiveFloatingCompanion, isUpdatingCompanion, onToggleCompanion }: BlobbiWidgetContentProps) {
  const projected = useProjectedBlobbiState(companion);
  const defaultStats: BlobbiStats = { hunger: 100, happiness: 100, health: 100, hygiene: 100, energy: 100 };
  const stats = projected?.stats ?? defaultStats;
  const { recipe, recipeLabel } = useStatusReaction({
    stats,
    enabled: companion.state !== 'sleeping',
  });

  const stage = companion.stage;

  // Get the stat keys relevant for this stage (eggs see fewer stats)
  const relevantStats = getVisibleStats(stage);

  // Filter stats by stage-appropriate actions
  const visibleStats = relevantStats.filter((stat) => {
    // Energy maps to sleep, which eggs can't do
    if (stat === 'energy') return stage !== 'egg';
    const actionName = STAT_ACTION_NAME[stat];
    if (!actionName) return false;
    return isActionVisibleForStage(stage, actionName);
  });

  const handleStatClick = useCallback(async (stat: keyof BlobbiStats) => {
    const mapping = STAT_ACTION_MAP[stat];
    if (!mapping) return;
    if (mapping === 'sleep') {
      await onRest();
    } else {
      try {
        await onUseItem(mapping);
      } catch {
        // Error already toasted by the mutation hook
      }
    }
  }, [onUseItem, onRest]);

  // When this Blobbi is the active floating companion, show "out exploring" state
  if (isActiveFloatingCompanion) {
    return (
      <BlobbiAwayState
        name={companion.name}
        size="sm"
        isUpdating={isUpdatingCompanion}
        onBringHome={onToggleCompanion}
      />
    );
  }

  return (
    <div className="relative flex flex-col items-center gap-3 py-3">
      {/* Take along button — top right */}
      <button
        onClick={onToggleCompanion}
        disabled={isUpdatingCompanion || isActionPending}
        className={cn(
          'absolute top-2 right-1 size-7 rounded-full flex items-center justify-center transition-colors',
          isCurrentCompanion
            ? 'text-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20'
            : 'text-violet-500 bg-violet-500/10 hover:bg-violet-500/20',
          (isUpdatingCompanion || isActionPending) && 'opacity-40 pointer-events-none',
        )}
        title={isCurrentCompanion ? 'With you' : 'Take along'}
      >
        {isUpdatingCompanion
          ? <Loader2 className="size-3.5 animate-spin" />
          : <Footprints className="size-3.5" />}
      </button>

      {/* Pet visual — links to full page */}
      <Link to="/blobbi" className="relative hover:scale-105 transition-transform">
        <BlobbiStageVisual
          companion={companion}
          size="lg"
          animated
          lookMode="follow-pointer"
          recipe={recipe}
          recipeLabel={recipeLabel}
        />
      </Link>

      {/* Name */}
      <Link to="/blobbi" className="text-sm font-semibold hover:text-primary transition-colors">
        {companion.name}
      </Link>

      {/* Unified stat wheels — each is both a status indicator and an action button */}
      <div className="flex items-center justify-center gap-1.5 px-2">
        {visibleStats.map((stat) => (
          <StatIndicator
            key={stat}
            stat={stat}
            value={stats[stat]}
            color={STAT_COLOR_MAP[stat]}
            careState={getBlobbiStatDisplayState({ stage, stat, value: stats[stat] ?? 100 }).careState}
            size="sm"
            onClick={() => handleStatClick(stat)}
            disabled={isActionPending}
          />
        ))}
      </div>
    </div>
  );
}
