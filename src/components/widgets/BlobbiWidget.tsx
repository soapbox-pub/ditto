import { useCallback, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftRight, Egg, Footprints, Loader2, X } from 'lucide-react';

import { BlobbiAwayState } from '@/blobbi/ui/BlobbiAwayState';
import { BlobbiStageVisual } from '@/blobbi/ui/BlobbiStageVisual';
import { StatIndicator } from '@/blobbi/ui/StatIndicator';
import { useProjectedBlobbiState } from '@blobbi/react/hooks/useProjectedBlobbiState';
import { useStatusReaction } from '@/blobbi/ui/hooks/useStatusReaction';
import { useBlobbisCollection } from '@/blobbi/core/hooks/useBlobbisCollection';
import { useBlobbiCompanionData } from '@/blobbi/companion/hooks/useBlobbiCompanionData';
import { useFreshBlobbiBeforeAction } from '@/blobbi/core/hooks/useFreshBlobbiBeforeAction';
import { useBlobbiUseInventoryItem } from '@/blobbi/actions/hooks/useBlobbiUseInventoryItem';
import { isActionVisibleForStage, type InventoryAction, type BlobbiAction } from '@/blobbi/actions/lib/blobbi-action-utils';
import { getVisibleStats } from '@blobbi/core/blobbi-decay';
import { getBlobbiStatDisplayState } from '@blobbi/core/blobbi-segments';
import { KIND_BLOBBI_STATE, KIND_BLOBBONAUT_PROFILE, updateBlobbiTags, updateBlobbonautTags, getSelectedBlobbiKey } from '@blobbi/core/blobbi';
import { applyBlobbiDecay } from '@blobbi/core/blobbi-decay';
import { getStreakTagUpdates } from '@blobbi/react/lib/blobbi-streak';
import { useBlobbonautProfile } from '@/hooks/useBlobbonautProfile';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { toast } from '@/hooks/useToast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import type { BlobbiCompanion } from '@blobbi/core/blobbi';
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

/** Mini Blobbi widget with live stats and quick actions. */
export function BlobbiWidget() {
  const { user } = useCurrentUser();
  const { companions, isLoading, updateCompanionEvent } = useBlobbisCollection();
  const { profile, updateProfileEvent, invalidate: invalidateProfile } = useBlobbonautProfile();
  const { fetchFreshBlobbiBeforeAction } = useFreshBlobbiBeforeAction();
  const { mutateAsync: publishEvent } = useNostrPublish();

  // Companions list (deduplicated by d-tag, newest wins, inside
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

  // Match BlobbiPage's selection logic: localStorage > first companion in the
  // deterministically-ordered collection. We no longer consult profile.has —
  // ownership/order comes from the authored kind 31124 collection (single
  // source of truth), so a drifted/wiped has list can't surface a stale egg.
  const localStorageKey = user?.pubkey ? getSelectedBlobbiKey(user.pubkey) : 'blobbi:selected:d:none';
  const [storedSelectedD, setStoredSelectedD] = useLocalStorage<string | null>(localStorageKey, null);

  const companion = useMemo<BlobbiCompanion | null>(() => {
    if (!filteredCompanions || filteredCompanions.length === 0) return null;
    if (storedSelectedD && filteredCompanionsByD[storedSelectedD]) return filteredCompanionsByD[storedSelectedD];
    return filteredCompanions[0];
  }, [filteredCompanions, filteredCompanionsByD, storedSelectedD]);

  // Zero-arg wrapper for fetching fresh data before an action (read step of
  // the read-modify-write pattern, same as BlobbiPage)
  const ensureCanonicalBeforeAction = useCallback(async () => {
    if (!companion || !profile) return null;
    return fetchFreshBlobbiBeforeAction({
      companion,
      profile,
      updateProfileEvent,
      updateCompanionEvent,
    });
  }, [companion, profile, fetchFreshBlobbiBeforeAction, updateProfileEvent, updateCompanionEvent]);

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
      allCompanions={filteredCompanions}
      onSelectCompanion={setStoredSelectedD}
      onUseItem={executeUseItem}
      onRest={handleRest}
      isActionPending={isActionPending}
      isCurrentCompanion={isCurrentCompanion}
      isActiveFloatingCompanion={isActiveFloatingCompanion}
      isUpdatingCompanion={isUpdatingCompanion}
      onToggleCompanion={handleSetAsCompanion}
      currentCompanionD={profile?.currentCompanion}
    />
  );
}

interface BlobbiWidgetContentProps {
  companion: BlobbiCompanion;
  allCompanions: BlobbiCompanion[];
  onSelectCompanion: (d: string) => void;
  onUseItem: (req: { itemId: string; action: InventoryAction }) => Promise<unknown>;
  onRest: () => Promise<void>;
  isActionPending: boolean;
  isCurrentCompanion: boolean;
  isActiveFloatingCompanion: boolean;
  isUpdatingCompanion: boolean;
  onToggleCompanion: () => Promise<void>;
  currentCompanionD?: string;
}

function BlobbiWidgetContent({
  companion,
  allCompanions,
  onSelectCompanion,
  onUseItem,
  onRest,
  isActionPending,
  isCurrentCompanion,
  isActiveFloatingCompanion,
  isUpdatingCompanion,
  onToggleCompanion,
  currentCompanionD,
}: BlobbiWidgetContentProps) {
  // Projected state with decay only — owner surfaces do not pre-project social
  // effects. Social effects are incorporated via explicit consolidation.
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

  const [switcherOpen, setSwitcherOpen] = useState(false);
  const hasMultipleCompanions = allCompanions.length > 1;
  const wheelHandlerRef = useRef<((e: WheelEvent) => void) | null>(null);

  /** Callback ref: attaches a non-passive wheel listener when the element mounts. */
  const scrollRef = useCallback((el: HTMLDivElement | null) => {
    // Clean up previous listener
    if (wheelHandlerRef.current && el) {
      el.removeEventListener('wheel', wheelHandlerRef.current);
    }
    if (!el) {
      wheelHandlerRef.current = null;
      return;
    }
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      e.stopPropagation();
      el.scrollBy({ left: e.deltaY });
    };
    wheelHandlerRef.current = onWheel;
    el.addEventListener('wheel', onWheel, { passive: false });
  }, []);

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
      {/* Action buttons — top right */}
      <div className="absolute top-2 right-1 flex flex-col items-center gap-1">
        {/* Take along button */}
        <button
          onClick={onToggleCompanion}
          disabled={isUpdatingCompanion || isActionPending}
          className={cn(
            'size-7 rounded-full flex items-center justify-center transition-colors',
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

        {/* Switch blobbi button */}
        {hasMultipleCompanions && (
          <Popover open={switcherOpen} onOpenChange={setSwitcherOpen}>
            <PopoverTrigger asChild>
              <button
                className="size-7 rounded-full flex items-center justify-center transition-colors text-muted-foreground bg-muted/50 hover:bg-muted hover:text-foreground"
                title="Switch Blobbi"
              >
                <ArrowLeftRight className="size-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="left" align="start" className="w-auto p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground">Switch Blobbi</p>
                <button
                  onClick={() => setSwitcherOpen(false)}
                  aria-label="Close"
                  className="size-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <X className="size-3" />
                </button>
              </div>
              <div className="relative max-w-[18rem]">
                <div
                  ref={scrollRef}
                  className="flex items-center gap-3 overflow-x-auto py-1 px-2 scrollbar-thin"
                >
                  {allCompanions.map((c) => {
                    const isSelected = c.d === companion.d;
                    const isFloatingCompanion = c.d === currentCompanionD;
                    return (
                      <button
                        key={c.d}
                        onClick={() => {
                          onSelectCompanion(c.d);
                          setSwitcherOpen(false);
                        }}
                        aria-label={`Switch to ${c.name}`}
                        className={cn(
                          'flex-shrink-0 flex flex-col items-center gap-1 transition-all duration-200 hover:-translate-y-0.5 hover:scale-105 active:scale-95',
                          isSelected && 'opacity-50 pointer-events-none',
                        )}
                        disabled={isSelected}
                      >
                        <div className="relative">
                          <BlobbiStageVisual companion={c} size="sm" />
                          {isFloatingCompanion && (
                            <div className="absolute -bottom-0.5 -right-0.5 size-4 rounded-full bg-background ring-1 ring-background flex items-center justify-center">
                              <Footprints className="size-2.5 text-emerald-500" />
                            </div>
                          )}
                        </div>
                        <span className="text-[10px] font-medium text-muted-foreground max-w-[4rem] truncate">
                          {c.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {/* Right fade gradient to hint at more content */}
                <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-popover to-transparent" />
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>

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
        {visibleStats.map((stat) => {
          const display = getBlobbiStatDisplayState({ stage, stat, value: stats[stat] ?? 100 });
          return (
            <StatIndicator
              key={stat}
              stat={stat}
              value={stats[stat]}
              color={STAT_COLOR_MAP[stat]}
              careState={display.careState}
              segments={{ filled: display.filled, max: display.max }}
              size="sm"
              onClick={() => handleStatClick(stat)}
              disabled={isActionPending}
            />
          );
        })}
      </div>
    </div>
  );
}
