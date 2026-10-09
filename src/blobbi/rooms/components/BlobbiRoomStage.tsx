/**
 * BlobbiRoomStage — the Blobbi visual standing in the room.
 *
 * Rendered inside a room anchor (see BlobbiRoomShell): the shell moves the
 * anchor to the Blobbi's feet on screen each frame and sets `--anchor-px`
 * (screen px per tile there), which scales the BLOBBI_BOX_PX art box to the
 * Blobbi's size at that spot in the 3D room. The body bottom is aligned to the anchor using
 * the per-form body inset, and the name floats above it at a readable size.
 * The 3D scene draws the Blobbi's shadow.
 */

import { BlobbiStageVisual } from '@/blobbi/ui/BlobbiStageVisual';
import { ReactionSparkles, ReactionBubbles } from '@/blobbi/ui/ReactionOverlays';
import { FloatingSocialHearts } from '@/blobbi/ui/FloatingSocialHearts';
import { getBlobbiBodyBottomInset } from '../lib/room-layout-schema';
import { cn } from '@/lib/utils';

import type { BlobbiCompanion } from '@blobbi-kit/core/blobbi';
import type { BlobbiEmotion } from '@/blobbi/ui/lib/emotion-types';
import type { BlobbiVisualRecipe } from '@/blobbi/ui/lib/recipe';
import type { BlobbiReactionState } from '@/blobbi/actions';
import type { InteractionReactionState } from '@/blobbi/ui/hooks/useInteractionReaction';
import { blobbiDisplayColors } from '@/blobbi/ui/lib/display-colors';
import { getV3BodyBottomInset } from '@/blobbi/ui/lib/v3-mouth';

// ─── Props ────────────────────────────────────────────────────────────────────

interface BlobbiRoomStageProps {
  companion: BlobbiCompanion;
  currentStats: {
    hunger: number;
    happiness: number;
    health: number;
    hygiene: number;
    energy: number;
  };
  isSleeping: boolean;
  statusRecipe: BlobbiVisualRecipe | undefined;
  statusRecipeLabel: string | undefined;
  effectiveEmotion: BlobbiEmotion;
  hasDevOverride: boolean;
  blobbiReaction: BlobbiReactionState;
  /** Temporary interaction reaction (sparkles, bubbles, hearts, body animation). */
  interactionReaction?: InteractionReactionState;
}

/** Side of the Blobbi's art box before the room scales it. */
const BLOBBI_BOX_PX = 200;

/**
 * Art box scale: the room's px-per-tile at the Blobbi's feet (`--anchor-px`)
 * times the box size in tiles (`--blobbi-tiles`), both set by the shell.
 */
const SCALE = `calc(var(--anchor-px, 100) * var(--blobbi-tiles, 2) / ${BLOBBI_BOX_PX})`;

/**
 * A Blobbi standing on its anchor point: a BLOBBI_BOX_PX art box scaled by
 * the room to its size at that spot, with the body bottom (not the art's
 * empty margin) on the floor, and its name tag, unscaled so it stays
 * readable, floating above.
 */
function Standing({ companion, nameTag, children }: { companion: BlobbiCompanion; nameTag?: React.ReactNode; children: React.ReactNode }) {
  // How much of the art box is empty below the body: for a V3 Blobbi the kit's
  // own ground line (every individual has its own); V1/V2 the per-form table.
  const inset = getV3BodyBottomInset(companion) ?? getBlobbiBodyBottomInset(companion.stage, companion.adultType ?? undefined);
  return (
    <div className="absolute left-0 top-0 pointer-events-none">
      <div
        className="absolute bottom-0 left-0"
        style={{
          width: BLOBBI_BOX_PX,
          height: BLOBBI_BOX_PX,
          transformOrigin: 'bottom left',
          transform: `scale(${SCALE}) translate(-50%, ${inset}%)`,
        }}
      >
        {children}
      </div>
      {nameTag && companion.stage !== 'egg' && (
        <div
          className="absolute left-0 bottom-0 pointer-events-none"
          style={{ transform: `translate(-50%, calc(${SCALE} * ${-(BLOBBI_BOX_PX * (1 - inset / 100))}px - 4px))` }}
        >
          {nameTag}
        </div>
      )}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BlobbiRoomStage({
  companion,
  currentStats,
  isSleeping,
  statusRecipe,
  statusRecipeLabel,
  effectiveEmotion,
  hasDevOverride,
  blobbiReaction,
  interactionReaction,
}: BlobbiRoomStageProps) {
  const bobDuration = `${4 - (currentStats.happiness / 100) * 1.5}s`;

  return (
    <Standing
      companion={companion}
      nameTag={
        <span className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-background/80 backdrop-blur-sm border border-border/30 shadow-sm px-2.5 py-0.5 text-sm font-semibold text-foreground">
          <span
            className="size-2 rounded-full ring-1 ring-foreground/10"
            style={{ background: blobbiDisplayColors(companion).baseColor }}
            aria-hidden
          />
          {companion.name}
        </span>
      }
    >
      <div
        className="relative size-full"
        style={!isSleeping ? { animation: `blobbi-bob ${bobDuration} ease-in-out infinite` } : undefined}
      >
        <div
          data-blobbi-visual
          className={cn('relative size-full transition-all duration-500', interactionReaction?.bodyAnimation)}
          style={!isSleeping ? { animation: `blobbi-sway ${6 - (currentStats.happiness / 100) * 2}s ease-in-out infinite` } : undefined}
        >
          <BlobbiStageVisual
            companion={companion}
            size="lg"
            animated={!isSleeping}
            reaction={blobbiReaction}
            recipe={hasDevOverride ? undefined : statusRecipe}
            recipeLabel={hasDevOverride ? undefined : statusRecipeLabel}
            emotion={effectiveEmotion}
            className="!size-full"
          />
          {/* Interaction reaction overlays — sparkles, bubbles, hearts */}
          <ReactionSparkles active={interactionReaction?.sparkles ?? false} />
          <ReactionBubbles active={interactionReaction?.bubbles ?? false} showBackdrop={false} />
          <FloatingSocialHearts active={interactionReaction?.hearts ?? false} />
        </div>
      </div>
    </Standing>
  );
}

// ─── Visiting Blobbi ──────────────────────────────────────────────────────────

/**
 * Another of the user's Blobbis, visiting the room. Same sizing as the
 * user's Blobbi; happy and showering hearts while `meeting`.
 */
export function BlobbiGuestStage({ companion, meeting }: { companion: BlobbiCompanion; meeting: boolean }) {
  const asleep = companion.state === 'sleeping';
  return (
    <Standing
      companion={companion}
      nameTag={
        <span className="flex items-center gap-1 whitespace-nowrap rounded-full bg-background/70 backdrop-blur-sm border border-border/30 px-2 py-px text-xs font-medium text-foreground/80">
          {companion.name}
        </span>
      }
    >
      <div className="relative size-full" style={{ animation: 'blobbi-bob 3.4s ease-in-out infinite' }}>
        <div className="relative size-full" style={{ animation: 'blobbi-sway 5s ease-in-out infinite' }}>
          <BlobbiStageVisual
            companion={companion}
            size="lg"
            animated
            emotion={meeting ? 'happy' : asleep ? undefined : 'neutral'}
            className="!size-full"
          />
          <FloatingSocialHearts active={meeting} />
        </div>
      </div>
    </Standing>
  );
}
