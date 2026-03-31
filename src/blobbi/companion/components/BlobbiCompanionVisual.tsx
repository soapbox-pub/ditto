/**
 * BlobbiCompanionVisual
 *
 * Visual component for rendering the companion Blobbi.
 *
 * Architecture:
 * - Outer shell: handles per-frame updates (float, shadow, drag state) — rerenders freely
 * - Inner MemoizedBlobbiVisual: renders the actual SVG — only rerenders when visual inputs change
 * - Eye gaze is driven imperatively via ref (no React rerenders for gaze)
 * - Reaction CSS classes (sway/bounce) applied on the outer float wrapper,
 *   NOT on the SVG container, to keep the SVG DOM node stable.
 */

import { useMemo, useRef, memo, type RefObject } from 'react';

import { BlobbiBabyVisual } from '@/blobbi/ui/BlobbiBabyVisual';
import { BlobbiAdultVisual } from '@/blobbi/ui/BlobbiAdultVisual';
import { companionDataToBlobbi } from '@/blobbi/ui/lib/adapters';
import { useEffectiveEmotion } from '@/blobbi/dev/EmotionDevContext';
import type { BlobbiEmotion } from '@/blobbi/ui/lib/emotion-types';
import type { BlobbiVisualRecipe } from '@/blobbi/ui/lib/recipe';
import type { BodyEffectsSpec } from '@/blobbi/ui/lib/bodyEffects';
import type { Blobbi } from '@/blobbi/core/types/blobbi';
import { cn } from '@/lib/utils';
import type { CompanionData, EyeOffset, CompanionDirection } from '../types/companion.types';

// ─── Props ────────────────────────────────────────────────────────────────────

interface BlobbiCompanionVisualProps {
  companion: CompanionData;
  size: number;
  eyeOffsetRef: RefObject<EyeOffset>;
  direction: CompanionDirection;
  isDragging: boolean;
  isWalking: boolean;
  floatOffset?: { x: number; y: number; rotation: number };
  isOnGround?: boolean;
  distanceFromGround?: number;
  recipe?: BlobbiVisualRecipe;
  recipeLabel?: string;
  emotion?: BlobbiEmotion;
  bodyEffects?: BodyEffectsSpec;
  className?: string;
  debugMode?: boolean;
}

// ─── Memoized Inner Visual ────────────────────────────────────────────────────
//
// Renders BlobbiAdultVisual / BlobbiBabyVisual with renderMode="companion".
// Wrapped in React.memo so it only rerenders when visual content changes.
// Per-frame props (float, drag, walking, gaze) are excluded.

interface MemoizedBlobbiVisualProps {
  stage: 'baby' | 'adult';
  blobbi: Blobbi;
  eyeOffsetRef: RefObject<EyeOffset>;
  recipe?: BlobbiVisualRecipe;
  recipeLabel?: string;
  emotion: BlobbiEmotion;
  bodyEffects?: BodyEffectsSpec;
}

const MemoizedBlobbiVisual = memo(function MemoizedBlobbiVisual({
  stage,
  blobbi,
  eyeOffsetRef,
  recipe,
  recipeLabel,
  emotion,
  bodyEffects,
}: MemoizedBlobbiVisualProps) {
  if (stage === 'baby') {
    return (
      <BlobbiBabyVisual
        blobbi={blobbi}
        renderMode="companion"
        lookMode="forward"
        externalEyeOffsetRef={eyeOffsetRef}
        recipe={recipe}
        recipeLabel={recipeLabel}
        emotion={emotion}
        bodyEffects={bodyEffects}
        className="size-full"
      />
    );
  }

  return (
    <BlobbiAdultVisual
      blobbi={blobbi}
      renderMode="companion"
      lookMode="forward"
      externalEyeOffsetRef={eyeOffsetRef}
      recipe={recipe}
      recipeLabel={recipeLabel}
      emotion={emotion}
      bodyEffects={bodyEffects}
      className="size-full"
    />
  );
}, (prev, next) => {
  return (
    prev.stage === next.stage &&
    prev.blobbi === next.blobbi &&
    prev.recipe === next.recipe &&
    prev.recipeLabel === next.recipeLabel &&
    prev.emotion === next.emotion &&
    prev.bodyEffects === next.bodyEffects
  );
});

// ─── Component ────────────────────────────────────────────────────────────────

export function BlobbiCompanionVisual({
  companion,
  size,
  eyeOffsetRef,
  direction,
  isDragging,
  isWalking,
  floatOffset = { x: 0, y: 0, rotation: 0 },
  isOnGround = true,
  distanceFromGround = 0,
  recipe: recipeProp,
  recipeLabel: recipeLabelProp,
  emotion: emotionProp,
  bodyEffects: bodyEffectsProp,
  className,
  debugMode = false,
}: BlobbiCompanionVisualProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const blobbi = useMemo(() => companionDataToBlobbi(companion), [companion]);

  // DEV ONLY: Get effective emotion from dev context (overrides production emotions)
  const devEmotion = useEffectiveEmotion();
  const hasDevOverride = devEmotion !== 'neutral';

  const effectiveRecipe = hasDevOverride ? undefined : recipeProp;
  const effectiveRecipeLabel = hasDevOverride ? undefined : recipeLabelProp;
  const effectiveEmotion = hasDevOverride ? devEmotion : (emotionProp ?? 'neutral');
  const effectiveBodyEffects = hasDevOverride ? undefined : bodyEffectsProp;

  // Float transform
  const blobbiTransform = useMemo(() => {
    const transforms: string[] = [];
    if (floatOffset.x !== 0 || floatOffset.y !== 0) {
      transforms.push(`translate(${floatOffset.x}px, ${floatOffset.y}px)`);
    }
    if (floatOffset.rotation !== 0) {
      transforms.push(`rotate(${floatOffset.rotation}deg)`);
    }
    return transforms.length > 0 ? transforms.join(' ') : undefined;
  }, [floatOffset]);

  // Reaction state for CSS animations on the OUTER wrapper
  const reaction = isDragging ? 'happy' : isWalking ? 'swaying' : 'idle';

  // ── Shadow ─────────────────────────────────────────────────────────────────
  const SHADOW_FADE_DISTANCE = 30;
  const SHADOW_MAX_OPACITY = 0.35;

  const showShadow = isOnGround && !isDragging && distanceFromGround < SHADOW_FADE_DISTANCE;
  const floatHeight = Math.abs(floatOffset.y);
  const groundFadeRatio = Math.max(0, 1 - distanceFromGround / SHADOW_FADE_DISTANCE);
  const floatFadeRatio = Math.max(0.85, 1 - floatHeight * 0.02);
  const shadowOpacity = SHADOW_MAX_OPACITY * groundFadeRatio * floatFadeRatio;
  const shadowScale = 0.9 + 0.1 * groundFadeRatio * floatFadeRatio;

  void direction; // kept for API compatibility

  return (
    <div
      ref={containerRef}
      className={cn('relative', className)}
      style={{ width: size, height: size }}
    >
      {/* Debug alignment markers */}
      {debugMode && (
        <>
          <div className="absolute inset-0 pointer-events-none" style={{ border: '2px solid lime', boxSizing: 'border-box' }} />
          <div className="absolute pointer-events-none" style={{ top: `${size * 0.88}px`, left: 0, right: 0, height: 2, backgroundColor: 'yellow' }} />
          <div className="absolute pointer-events-none" style={{ bottom: 0, left: 0, right: 0, height: 2, backgroundColor: 'cyan' }} />
          <div className="absolute pointer-events-none" style={{ top: 2, left: 2, fontSize: 8, color: 'white', backgroundColor: 'black', padding: '1px 2px' }}>
            shift: {size * 0.12}px
          </div>
        </>
      )}

      {/* Floor shadow */}
      {!debugMode && showShadow && shadowOpacity > 0.01 && (
        <div
          className="absolute pointer-events-none"
          style={{
            bottom: -20,
            left: '50%',
            width: size * 0.5,
            height: size * 0.08,
            transform: `translateX(-50%) scaleX(${shadowScale})`,
            background: `radial-gradient(ellipse at center, rgba(0,0,0,${shadowOpacity}) 0%, rgba(0,0,0,${shadowOpacity * 0.5}) 40%, transparent 70%)`,
            borderRadius: '50%',
            filter: 'blur(4px)',
            opacity: groundFadeRatio,
            transition: 'opacity 0.15s ease-out, transform 0.1s ease-out',
          }}
        />
      )}

      {/* Float + reaction wrapper */}
      <div
        className={cn(
          'size-full',
          (reaction === 'swaying' || reaction === 'happy') && 'animate-blobbi-sway',
        )}
        style={{
          transform: [
            `translateY(${size * 0.12}px)`,
            blobbiTransform,
          ].filter(Boolean).join(' ') || undefined,
          transformOrigin: 'center bottom',
          transition: isDragging ? 'none' : 'transform 0.05s ease-out',
          ...(debugMode ? { outline: '2px dashed magenta' } : {}),
        }}
      >
        {(companion.stage === 'baby' || companion.stage === 'adult') && (
          <MemoizedBlobbiVisual
            stage={companion.stage}
            blobbi={blobbi}
            eyeOffsetRef={eyeOffsetRef}
            recipe={effectiveRecipe}
            recipeLabel={effectiveRecipeLabel}
            emotion={effectiveEmotion}
            bodyEffects={effectiveBodyEffects}
          />
        )}
      </div>
    </div>
  );
}
