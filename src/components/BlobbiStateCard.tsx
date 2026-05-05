import { useMemo } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';

import { BlobbiStageVisual, type BlobbiLookMode } from '@/blobbi/ui/BlobbiStageVisual';
import { parseBlobbiEvent } from '@/blobbi/core/lib/blobbi';
import { calculateProjectedDecay } from '@/blobbi/core/hooks/useProjectedBlobbiState';
import { useBlobbiInteractions } from '@/blobbi/core/hooks/useBlobbiInteractions';
import { resolveStatusRecipe, attenuateRecipeForFeed, EMPTY_RECIPE } from '@/blobbi/ui/lib/status-reactions';
import { buildSleepingRecipe } from '@/blobbi/ui/lib/recipe';
import { ReactionSparkles, ReactionBubbles } from '@/blobbi/ui/ReactionOverlays';
import { FloatingSocialHearts } from '@/blobbi/ui/FloatingSocialHearts';
import type { InteractionReactionState } from '@/blobbi/ui/hooks/useInteractionReaction';
import { cn } from '@/lib/utils';

interface BlobbiStateCardProps {
  event: NostrEvent;
  /** Controls eye tracking behavior. Default: 'forward' (eyes look straight ahead). */
  lookMode?: BlobbiLookMode;
  /** Temporary interaction reaction state (body animation, emotion override, particle overlays). */
  interactionReaction?: InteractionReactionState;
}

export function BlobbiStateCard({ event, lookMode = 'forward', interactionReaction }: BlobbiStateCardProps) {
  const companion = useMemo(() => parseBlobbiEvent(event), [event]);

  const isSleeping = companion?.state === 'sleeping';
  const isEgg = companion?.stage === 'egg';

  // Fetch kind 1124 interactions targeting this Blobbi.
  // Disabled for eggs: they do not participate in the social stat-loss/care flow.
  // Not gated on socialOpen: past interactions must still affect projected
  // status even after the owner disables social. The hook is disabled when
  // companion is null (invalid event) and returns an empty array.
  const { interactions } = useBlobbiInteractions(isEgg ? null : (companion ?? null));

  // ── Project stats forward in time, then resolve visual recipe ──
  // Feed cards show a snapshot, not a live ticker, so we call the pure
  // calculateProjectedDecay() once per render instead of using the
  // interval-based useProjectedBlobbiState hook.  This gives us the
  // same decay math the room view uses (applyBlobbiDecay under the
  // hood) without any per-card setInterval overhead.
  //
  // When social interactions are available, they are layered on top
  // of the decayed stats via the social projection pipeline.
  const { recipe: feedRecipe, recipeLabel: feedRecipeLabel } = useMemo(() => {
    if (!companion || isEgg) return { recipe: EMPTY_RECIPE, recipeLabel: 'neutral' };

    const socialInteractions = interactions.length > 0 ? interactions : undefined;
    const { stats } = calculateProjectedDecay(companion, undefined, socialInteractions);

    const result = resolveStatusRecipe(stats);

    // Attenuate body effects for feed-card size, then apply sleep overlay
    const attenuated = attenuateRecipeForFeed(result.recipe);
    const final = isSleeping ? buildSleepingRecipe(attenuated) : attenuated;

    return { recipe: final, recipeLabel: isSleeping ? 'sleeping' : result.label };
  }, [companion, isEgg, isSleeping, interactions]);

  if (!companion) return null;

  // During an active interaction reaction with an emotion override, the emotion
  // prop drives the face instead of the recipe (recipe takes precedence when set).
  const reactionActive = interactionReaction?.isActive ?? false;
  const hasEmotionOverride = reactionActive && !!interactionReaction?.emotionOverride;

  return (
    <div className="flex flex-col items-center py-4">
      {/* Blobbi visual — reflects current condition */}
      <div className="relative">
        <div className="absolute inset-0 -m-8 bg-primary/5 rounded-full blur-3xl" />
        <div
          className={cn(
            'relative transition-all duration-500',
            reactionActive && interactionReaction?.bodyAnimation,
          )}
        >
          <BlobbiStageVisual
            companion={companion}
            size="lg"
            animated={!isSleeping}
            lookMode={lookMode}
            recipe={hasEmotionOverride ? undefined : feedRecipe}
            recipeLabel={hasEmotionOverride ? undefined : feedRecipeLabel}
            emotion={hasEmotionOverride ? interactionReaction.emotionOverride ?? undefined : undefined}
            className="size-48 sm:size-56"
          />
          {/* Interaction reaction overlays — sparkles, bubbles, hearts (not for eggs) */}
          {!isEgg && (
            <>
              <ReactionSparkles active={interactionReaction?.sparkles ?? false} />
              <ReactionBubbles active={interactionReaction?.bubbles ?? false} />
              <FloatingSocialHearts active={interactionReaction?.hearts ?? false} />
            </>
          )}
        </div>
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
