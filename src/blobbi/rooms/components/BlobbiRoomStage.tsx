/**
 * BlobbiRoomStage — Absolutely positioned Blobbi visual overlay for room display.
 *
 * Uses the room's shell coordinate system directly:
 * - Ground line at `top: (1 - ROOM_FLOOR_RATIO) * 100%` of the shell.
 * - Blobbi body bottom is anchored to this ground line.
 * - Blobbi name sits below the ground line (on the floor area).
 *
 * This component must be rendered inside an `absolute inset-0` wrapper that
 * shares the same positioning parent as the wall/floor background layers.
 *
 * Stats are rendered separately by BlobbiRoomStatusHud in the top HUD area.
 */

import { BlobbiStageVisual } from '@/blobbi/ui/BlobbiStageVisual';
import { ROOM_FLOOR_RATIO, getBlobbiBodyBottomInset } from '../lib/room-layout-schema';

import type { BlobbiCompanion } from '@/blobbi/core/lib/blobbi';
import type { BlobbiEmotion } from '@/blobbi/ui/lib/emotion-types';
import type { BlobbiVisualRecipe } from '@/blobbi/ui/lib/recipe';
import type { BlobbiReactionState } from '@/blobbi/actions';

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
  stageRef,
}: BlobbiRoomStageProps) {
  // Body-bottom inset: how much of the visual box is empty below the body
  const bodyBottomInset = getBlobbiBodyBottomInset(companion.stage, companion.adultType ?? undefined);

  return (
    <div ref={stageRef} className="absolute inset-0 pointer-events-none">
      {/* Blobbi anchor: positioned so the body bottom sits at the ground line.
          Strategy:
          1. Anchor div top = ground line.
          2. Visual wrapper translateY(-100%) → wrapper bottom = ground line.
          3. Then translateY(+bodyBottomInset%) → pushes the wrapper down
             by its whitespace amount (% of own height), so the BODY bottom
             (not container bottom) lands exactly at the ground line.
          Combined: translateY(calc(-100% + bodyBottomInset%))
       */}
      <div
        className="absolute left-1/2"
        style={{ top: `${GROUND_LINE_PCT}%` }}
      >
        <div
          style={{ transform: `translate(-50%, calc(-100% + ${bodyBottomInset}%))` }}
        >
          {/* Bob wrapper (translateY animation) */}
          <div
            className="relative"
            style={!isSleeping ? {
              animation: `blobbi-bob ${4 - (currentStats.happiness / 100) * 1.5}s ease-in-out infinite`,
            } : undefined}
          >
            {/* Sway wrapper (rotate animation) — separate from bob to avoid transform conflict */}
            <div
              className="relative transition-all duration-500 pointer-events-none"
              style={{
                ...(isEgg
                  ? { width: 'clamp(90px, 25dvh, 180px)', height: 'clamp(90px, 25dvh, 180px)' }
                  : { width: 'clamp(110px, 30dvh, 240px)', height: 'clamp(110px, 30dvh, 240px)' }
                ),
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
            </div>
          </div>
        </div>
      </div>

      {/* Blobbi name — positioned below ground line */}
      {!isEgg && (
        <div
          className="absolute inset-x-0 flex justify-center pt-1"
          style={{ top: `${GROUND_LINE_PCT}%` }}
        >
          <h2
            className="text-lg sm:text-xl md:text-2xl font-bold text-center"
            style={{ color: companion.visualTraits.baseColor }}
          >
            {companion.name}
          </h2>
        </div>
      )}
    </div>
  );
}
