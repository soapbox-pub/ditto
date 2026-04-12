import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Egg, Utensils, Gamepad2, Droplets, Moon, Sun } from 'lucide-react';

import { BlobbiStageVisual } from '@/blobbi/ui/BlobbiStageVisual';
import { useProjectedBlobbiState } from '@/blobbi/core/hooks/useProjectedBlobbiState';
import { useStatusReaction } from '@/blobbi/ui/hooks/useStatusReaction';
import { useBlobbisCollection } from '@/blobbi/core/hooks/useBlobbisCollection';
import { useBlobbiMigration } from '@/blobbi/core/hooks/useBlobbiMigration';
import { useBlobbiUseInventoryItem } from '@/blobbi/actions/hooks/useBlobbiUseInventoryItem';
import { isActionVisibleForStage, type InventoryAction } from '@/blobbi/actions/lib/blobbi-action-utils';
import { KIND_BLOBBI_STATE, updateBlobbiTags } from '@/blobbi/core/lib/blobbi';
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

/** Map stat keys to Tailwind color classes. */
const STAT_COLORS: Record<string, string> = {
  hunger: 'bg-orange-500',
  happiness: 'bg-yellow-500',
  health: 'bg-green-500',
  hygiene: 'bg-blue-500',
  energy: 'bg-violet-500',
};

const STAT_LABELS: Record<string, string> = {
  hunger: 'Hunger',
  happiness: 'Happy',
  health: 'Health',
  hygiene: 'Hygiene',
  energy: 'Energy',
};

/** Default item IDs for quick actions. */
const QUICK_ITEMS: Record<string, { itemId: string; action: InventoryAction }> = {
  feed: { itemId: 'food_apple', action: 'feed' },
  play: { itemId: 'toy_ball', action: 'play' },
  clean: { itemId: 'hyg_soap', action: 'clean' },
};

/** localStorage key helper matching BlobbiPage pattern. */
function getSelectedBlobbiKey(pubkey: string): string {
  return `blobbi:selected:d:${pubkey.slice(0, 8)}`;
}

/** Mini Blobbi widget with live stats and quick actions. */
export function BlobbiWidget() {
  const { user } = useCurrentUser();
  const { companions, companionsByD, isLoading, updateCompanionEvent } = useBlobbisCollection();
  const { profile, updateProfileEvent } = useBlobbonautProfile();
  const { ensureCanonicalBlobbiBeforeAction } = useBlobbiMigration();
  const { mutateAsync: publishEvent } = useNostrPublish();

  // Match BlobbiPage's selection logic: localStorage > profile.has > first companion
  const localStorageKey = user?.pubkey ? getSelectedBlobbiKey(user.pubkey) : 'blobbi:selected:d:none';
  const [storedSelectedD, setStoredSelectedD] = useLocalStorage<string | null>(localStorageKey, null);

  const companion = useMemo<BlobbiCompanion | null>(() => {
    if (!companions || companions.length === 0) return null;
    // Priority 1: localStorage selection
    if (storedSelectedD && companionsByD[storedSelectedD]) return companionsByD[storedSelectedD];
    // Priority 2: first from profile.has
    if (profile) {
      for (const d of profile.has) {
        if (companionsByD[d]) return companionsByD[d];
      }
    }
    // Priority 3: first companion
    return companions[0];
  }, [companions, companionsByD, storedSelectedD, profile]);

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

      const event = await publishEvent({ kind: KIND_BLOBBI_STATE, content: canonical.content, tags: newTags });
      updateCompanionEvent(event);
      toast({ title: isCurrentlySleeping ? 'Woke up!' : 'Resting...' });
    } catch {
      toast({ title: 'Action failed', variant: 'destructive' });
    } finally {
      setIsSleepPending(false);
    }
  }, [user?.pubkey, companion, ensureCanonicalBeforeAction, publishEvent, updateCompanionEvent]);

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
        <div className="w-full space-y-2 px-4">
          <Skeleton className="h-2 w-full rounded-full" />
          <Skeleton className="h-2 w-full rounded-full" />
          <Skeleton className="h-2 w-full rounded-full" />
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
    />
  );
}

interface BlobbiWidgetContentProps {
  companion: BlobbiCompanion;
  onUseItem: (req: { itemId: string; action: InventoryAction }) => Promise<unknown>;
  onRest: () => Promise<void>;
  isActionPending: boolean;
}

function BlobbiWidgetContent({ companion, onUseItem, onRest, isActionPending }: BlobbiWidgetContentProps) {
  const projected = useProjectedBlobbiState(companion);
  const defaultStats = { hunger: 100, happiness: 100, health: 100, hygiene: 100, energy: 100 };
  const { recipe, recipeLabel } = useStatusReaction({
    stats: projected?.stats ?? defaultStats,
    enabled: companion.state !== 'sleeping',
  });
  const stage = companion.stage;
  const isSleeping = companion.state === 'sleeping';

  // Determine which quick actions are visible for this stage
  const showFeed = isActionVisibleForStage(stage, 'feed');
  const showPlay = isActionVisibleForStage(stage, 'play');
  const showClean = isActionVisibleForStage(stage, 'clean');
  const showSleep = stage !== 'egg'; // eggs can't sleep

  const handleQuickAction = useCallback(async (key: string) => {
    const item = QUICK_ITEMS[key];
    if (!item) return;
    try {
      await onUseItem(item);
    } catch {
      // Error already toasted by the mutation hook
    }
  }, [onUseItem]);

  return (
    <div className="flex flex-col items-center gap-3 py-3">
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

      {/* Stat bars */}
      {projected && projected.visibleStats.length > 0 && (
        <div className="w-full space-y-1.5 px-3">
          {projected.visibleStats.map(({ stat, value, status }) => (
            <div key={stat} className="flex items-center gap-2">
              <span className={cn(
                'text-[10px] w-12 text-right shrink-0',
                status === 'critical' ? 'text-destructive font-bold' :
                status === 'warning' ? 'text-orange-500 font-medium' :
                'text-muted-foreground',
              )}>
                {STAT_LABELS[stat] ?? stat}
              </span>
              <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-1000',
                    STAT_COLORS[stat] ?? 'bg-primary',
                    status === 'critical' && 'animate-pulse',
                  )}
                  style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quick action buttons */}
      <div className="flex items-center justify-center gap-2 px-3 pt-1">
        {showFeed && (
          <QuickActionButton
            icon={<Utensils className="size-3.5" />}
            label="Feed"
            color="text-orange-500 bg-orange-500/10 hover:bg-orange-500/20"
            disabled={isActionPending}
            onClick={() => handleQuickAction('feed')}
          />
        )}
        {showPlay && (
          <QuickActionButton
            icon={<Gamepad2 className="size-3.5" />}
            label="Play"
            color="text-yellow-500 bg-yellow-500/10 hover:bg-yellow-500/20"
            disabled={isActionPending}
            onClick={() => handleQuickAction('play')}
          />
        )}
        {showClean && (
          <QuickActionButton
            icon={<Droplets className="size-3.5" />}
            label="Clean"
            color="text-blue-500 bg-blue-500/10 hover:bg-blue-500/20"
            disabled={isActionPending}
            onClick={() => handleQuickAction('clean')}
          />
        )}
        {showSleep && (
          <QuickActionButton
            icon={isSleeping ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
            label={isSleeping ? 'Wake' : 'Sleep'}
            color="text-violet-500 bg-violet-500/10 hover:bg-violet-500/20"
            disabled={isActionPending}
            onClick={onRest}
          />
        )}
      </div>
    </div>
  );
}

interface QuickActionButtonProps {
  icon: React.ReactNode;
  label: string;
  color: string;
  disabled: boolean;
  onClick: () => void;
}

function QuickActionButton({ icon, label, color, disabled, onClick }: QuickActionButtonProps) {
  return (
    <button
      onClick={(e) => { e.preventDefault(); onClick(); }}
      disabled={disabled}
      className={cn(
        'flex flex-col items-center gap-0.5 rounded-xl px-2.5 py-1.5 transition-colors',
        color,
        disabled && 'opacity-40 pointer-events-none',
      )}
      title={label}
    >
      {icon}
      <span className="text-[9px] font-medium leading-none">{label}</span>
    </button>
  );
}
