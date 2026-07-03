/**
 * BlobbiRoomStage — Absolutely positioned Blobbi visual overlay for room display.
 *
 * Uses the room's shell coordinate system directly:
 * - Ground line at `top: (1 - ROOM_FLOOR_RATIO) * 100%` of the shell.
 * - Blobbi body bottom is anchored to this ground line.
 * - Blobbi name floats above the visual and bobs with the Blobbi.
 * - An animated shadow ellipse sits at the ground line below the Blobbi.
 *
 * Sizing uses percentage-of-room-width so Blobbi scales proportionally with
 * the room canvas (same coordinate system as furniture).
 *
 * This component must be rendered inside an `absolute inset-0` wrapper that
 * shares the same positioning parent as the wall/floor background layers.
 *
 * Stats are rendered separately by BlobbiRoomStatusHud in the top HUD area.
 */

import { BlobbiStageVisual } from '@/blobbi/ui/BlobbiStageVisual';
import { ReactionSparkles, ReactionBubbles } from '@/blobbi/ui/ReactionOverlays';
import { FloatingSocialHearts } from '@/blobbi/ui/FloatingSocialHearts';
import { ROOM_FLOOR_RATIO, getBlobbiBodyBottomInset } from '../lib/room-layout-schema';
import { cn } from '@/lib/utils';

import type { BlobbiCompanion } from '@blobbi-kit/core/blobbi';
import type { BlobbiEmotion } from '@/blobbi/ui/lib/emotion-types';
import type { BlobbiVisualRecipe } from '@/blobbi/ui/lib/recipe';
import type { BlobbiReactionState } from '@/blobbi/actions';
import type { InteractionReactionState } from '@/blobbi/ui/hooks/useInteractionReaction';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface BlobbiRoomStageProps {
  companion: BlobbiCompanion;
  currentStats: {
    hunger: number;
    happiness: number;
    health: number;
    hygiene: number;
    energy: number;
  };
  isSleeping: boolean;
  isEgg: boolean;
  statusRecipe: BlobbiVisualRecipe | undefined;
  statusRecipeLabel: string | undefined;
  effectiveEmotion: BlobbiEmotion;
  hasDevOverride: boolean;
  blobbiReaction: BlobbiReactionState;
  /** Temporary interaction reaction (sparkles, bubbles, hearts, body animation). */
  interactionReaction?: InteractionReactionState;
  stageRef: React.RefObject<HTMLDivElement | null>;
}

// ─── Ground line position (% from top of shell) ──────────────────────────────

const GROUND_LINE_PCT = (1 - ROOM_FLOOR_RATIO) * 100;

// ─── Component ────────────────────────────────────────────────────────────────

export function BlobbiRoomStage({
  companion,
  currentStats,
  isSleeping,
  isEgg,
  statusRecipe,
  statusRecipeLabel,
  effectiveEmotion,
  hasDevOverride,
  blobbiReaction,
  interactionReaction,
  stageRef,
}: BlobbiRoomStageProps) {
  // Body-bottom inset: how much of the visual box is empty below the body
  const bodyBottomInset = getBlobbiBodyBottomInset(companion.stage, companion.adultType ?? undefined);

  // Bob animation duration — shared between the Blobbi bob and the shadow breathe
  const bobDuration = `${4 - (currentStats.happiness / 100) * 1.5}s`;

  return (
    <div ref={stageRef} className="absolute inset-0 pointer-events-none">
      {/* Blobbi anchor: full-width at the ground line.
          Uses inset-x-0 so descendant percentage widths resolve against
          room canvas width — keeping Blobbi proportional with furniture.
          Vertical alignment:
          1. Body wrapper translateY(-100%) → wrapper bottom = ground line.
          2. Then translateY(+bodyBottomInset%) → compensates for SVG whitespace
             below the visible body, so the BODY bottom lands at the ground line.
       */}
      <div
        className="absolute inset-x-0"
        style={{ top: `${GROUND_LINE_PCT}%` }}
      >
        {/* Ground shadow — radial-gradient ellipse at the ground line, behind the Blobbi.
            Breathes in sync with the bob: contracts when Blobbi is up, expands when down.
            Centered at 50% of anchor (= room center) via left + translateX(-50%).
            Uses aspect-ratio for height so it doesn't depend on anchor's auto height. */}
        <div
          className="absolute z-0 pointer-events-none"
          aria-hidden
          style={{
            top: 4,
            left: '50%',
            transformOrigin: 'center center',
            background: 'radial-gradient(ellipse, rgba(0,0,0,0.22) 0%, rgba(0,0,0,0.13) 38%, transparent 68%)',
            width: isEgg ? '22%' : '28%',
            aspectRatio: isEgg ? '4' : '4.5',
            ...(!isSleeping
              ? { animation: `blobbi-shadow-breathe ${bobDuration} ease-in-out infinite` }
              : { transform: 'translateX(-50%)' }
            ),
          }}
        />
        {/* Body alignment wrapper: block fills anchor width, shifted up vertically.
            Children's % widths resolve against this (= room width). */}
        <div
          className="relative z-10"
          style={{ transform: `translateY(calc(-100% + ${bodyBottomInset}%))` }}
        >
          {/* Bob wrapper: full-width flex container that centers the Blobbi horizontally */}
          <div
            className="relative w-full flex justify-center"
            style={!isSleeping ? {
              animation: `blobbi-bob ${bobDuration} ease-in-out infinite`,
            } : undefined}
          >
            {/* Blobbi name — floating label above the visual, bobs but does not sway */}
            {!isEgg && (
              <div
                className="absolute bottom-full left-1/2 mb-1 pointer-events-none"
                style={{ transform: 'translateX(-50%)' }}
              >
                <span
                  className="whitespace-nowrap text-sm font-bold drop-shadow-sm"
                  style={{ color: companion.visualTraits.baseColor }}
                >
                  {companion.name}
                </span>
              </div>
            )}
            {/* Sway wrapper (rotate animation) — separate from bob to avoid transform conflict.
                width: 30% resolves against the bob wrapper (w-full = canvas width),
                so Blobbi scales proportionally with the room canvas. */}
            <div
              data-blobbi-visual
              className={cn(
                'relative transition-all duration-500 pointer-events-none',
                interactionReaction?.bodyAnimation,
              )}
              style={{
                width: isEgg ? '24%' : '30%',
                aspectRatio: '1',
                ...(!isSleeping ? {
                  animation: `blobbi-sway ${6 - (currentStats.happiness / 100) * 2}s ease-in-out infinite`,
                } : undefined),
              }}
            >
              <div className="absolute inset-0 -m-16 sm:-m-20 bg-primary/5 rounded-full blur-3xl" />
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
        </div>
      </div>
    </div>
  );
}
