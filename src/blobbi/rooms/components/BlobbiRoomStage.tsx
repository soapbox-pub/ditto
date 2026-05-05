/**
 * BlobbiRoomStage — Absolutely positioned Blobbi visual overlay for room display.
 *
 * Uses the room's shell coordinate system directly:
 * - Ground line at `top: (1 - ROOM_FLOOR_RATIO) * 100%` of the shell.
 * - Blobbi body bottom is anchored to this ground line.
 * - Blobbi name floats above the visual and bobs with the Blobbi.
 * - An animated shadow ellipse sits at the ground line below the Blobbi.
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

  // Bob animation duration — shared between the Blobbi bob and the shadow breathe
  const bobDuration = `${4 - (currentStats.happiness / 100) * 1.5}s`;

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
        {/* Ground shadow — radial-gradient ellipse at the ground line, behind the Blobbi.
            Breathes in sync with the bob: contracts when Blobbi is up, expands when down.
            Positioned with left:0 + translateX(-50%) to center on the anchor's left edge (= stage center).
            Uses radial-gradient for a true soft ellipse with natural falloff (no blur filter needed). */}
        <div
          className="absolute z-0 pointer-events-none"
          aria-hidden
          style={{
            top: 4,
            left: 0,
            transformOrigin: 'center center',
            background: 'radial-gradient(ellipse, rgba(0,0,0,0.22) 0%, rgba(0,0,0,0.13) 38%, transparent 68%)',
            width: isEgg ? 'clamp(68px, 19dvh, 135px)' : 'clamp(66px, 18dvh, 144px)',
            height: isEgg ? 'clamp(16px, 5dvh, 32px)' : 'clamp(16px, 4dvh, 30px)',
            ...(!isSleeping
              ? { animation: `blobbi-shadow-breathe ${bobDuration} ease-in-out infinite` }
              : { transform: 'translateX(-50%)' }
            ),
          }}
        />
        <div
          className="relative z-10"
          style={{ transform: `translate(-50%, calc(-100% + ${bodyBottomInset}%))` }}
        >
          {/* Bob wrapper (translateY animation) */}
          <div
            className="relative"
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
            {/* Sway wrapper (rotate animation) — separate from bob to avoid transform conflict */}
            <div
              data-blobbi-visual
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
    </div>
  );
}
