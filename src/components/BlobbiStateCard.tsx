import { useMemo } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';

import { BlobbiStageVisual, type BlobbiLookMode } from '@/blobbi/ui/BlobbiStageVisual';
import { parseBlobbiEvent } from '@/blobbi/core/lib/blobbi';
import { calculateProjectedDecay } from '@/blobbi/core/hooks/useProjectedBlobbiState';
import { resolveStatusRecipe, attenuateRecipeForFeed, EMPTY_RECIPE } from '@/blobbi/ui/lib/status-reactions';
import { buildSleepingRecipe } from '@/blobbi/ui/lib/recipe';

interface BlobbiStateCardProps {
  event: NostrEvent;
  /** Controls eye tracking behavior. Default: 'forward' (eyes look straight ahead). */
  lookMode?: BlobbiLookMode;
}

export function BlobbiStateCard({ event, lookMode = 'forward' }: BlobbiStateCardProps) {
  const companion = useMemo(() => parseBlobbiEvent(event), [event]);

  const isSleeping = companion?.state === 'sleeping';
  const isEgg = companion?.stage === 'egg';

  // ── Project stats forward in time, then resolve visual recipe ──
  // Feed cards show a snapshot, not a live ticker, so we call the pure
  // calculateProjectedDecay() once per render instead of using the
  // interval-based useProjectedBlobbiState hook.  This gives us the
  // same decay math the room view uses (applyBlobbiDecay under the
  // hood) without any per-card setInterval overhead.
  const { recipe: feedRecipe, recipeLabel: feedRecipeLabel } = useMemo(() => {
    if (!companion || isEgg) return { recipe: EMPTY_RECIPE, recipeLabel: 'neutral' };

    const { stats } = calculateProjectedDecay(companion);

    const result = resolveStatusRecipe(stats);

    // Attenuate body effects for feed-card size, then apply sleep overlay
    const attenuated = attenuateRecipeForFeed(result.recipe);
    const final = isSleeping ? buildSleepingRecipe(attenuated) : attenuated;

    return { recipe: final, recipeLabel: isSleeping ? 'sleeping' : result.label };
  }, [companion, isEgg, isSleeping]);

  if (!companion) return null;

  return (
    <div className="flex flex-col items-center py-4">
      {/* Blobbi visual — reflects current condition */}
      <div className="relative">
        <div className="absolute inset-0 -m-8 bg-primary/5 rounded-full blur-3xl" />
        <BlobbiStageVisual
          companion={companion}
          size="lg"
          animated={!isSleeping}
          lookMode={lookMode}
          recipe={feedRecipe}
          recipeLabel={feedRecipeLabel}
          className="size-48 sm:size-56"
        />
      </div>

      {/* Name */}
      <h3
        className="mt-3 text-xl font-bold text-center"
        style={{ color: companion.visualTraits.baseColor }}
      >
        {companion.name}
      </h3>
    </div>
  );
}
