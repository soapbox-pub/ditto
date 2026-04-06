import { useMemo } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';

import { BlobbiStageVisual } from '@/blobbi/ui/BlobbiStageVisual';
import { parseBlobbiEvent } from '@/blobbi/core/lib/blobbi';
import { resolveStatusRecipe, attenuateRecipeForFeed, EMPTY_RECIPE } from '@/blobbi/ui/lib/status-reactions';
import { buildSleepingRecipe } from '@/blobbi/ui/lib/recipe';
import type { BlobbiStats } from '@/blobbi/core/types/blobbi';

export function BlobbiStateCard({ event }: { event: NostrEvent }) {
  const companion = useMemo(() => parseBlobbiEvent(event), [event]);

  if (!companion) return null;

  const isSleeping = companion.state === 'sleeping';
  const isEgg = companion.stage === 'egg';

  // ── Resolve visual recipe from on-chain stats ──
  // Uses the same resolveStatusRecipe + thresholds as the room view.
  // Undefined stats default to 100 (healthy), matching BlobbiPage behaviour.
  const { recipe: feedRecipe, recipeLabel: feedRecipeLabel } = useMemo(() => {
    if (isEgg) return { recipe: EMPTY_RECIPE, recipeLabel: 'neutral' };

    const stats: BlobbiStats = {
      hunger: companion.stats.hunger ?? 100,
      happiness: companion.stats.happiness ?? 100,
      health: companion.stats.health ?? 100,
      hygiene: companion.stats.hygiene ?? 100,
      energy: companion.stats.energy ?? 100,
    };

    const result = resolveStatusRecipe(stats);

    // Attenuate body effects for feed-card size, then apply sleep overlay
    const attenuated = attenuateRecipeForFeed(result.recipe);
    const final = isSleeping ? buildSleepingRecipe(attenuated) : attenuated;

    return { recipe: final, recipeLabel: isSleeping ? 'sleeping' : result.label };
  }, [companion.stats, isEgg, isSleeping]);

  return (
    <div className="flex flex-col items-center py-4">
      {/* Blobbi visual — reflects current condition */}
      <div className="relative">
        <div className="absolute inset-0 -m-8 bg-primary/5 rounded-full blur-3xl" />
        <BlobbiStageVisual
          companion={companion}
          size="lg"
          animated={!isSleeping}
          lookMode="forward"
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
