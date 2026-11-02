/**
 * BlobbiCompanionVisual
 *
 * Visual component for rendering the companion Blobbi.
 *
 * Architecture:
 * - Outer shell: handles drag state and ground proximity
 * - Float wrapper: owns translateY alignment + JS float offset. The float is
 *   written to the DOM imperatively from a rAF loop (no React rerenders).
 * - Sway wrapper: owns CSS rotation animation only (animate-blobbi-sway)
 *   Kept separate from float wrapper so CSS @keyframes don't override the
 *   inline translateY, which would make Blobbi float above the ground.
 * - Inner MemoizedBlobbiVisual: renders the actual SVG — only rerenders when visual inputs change
 * - Eye gaze is driven imperatively via ref (no React rerenders for gaze)
 */

import { useEffect, useLayoutEffect, useMemo, useRef, memo, type RefObject } from 'react';

import { BlobbiBabyVisual } from '@/blobbi/ui/BlobbiBabyVisual';
import { BlobbiAdultVisual } from '@/blobbi/ui/BlobbiAdultVisual';
import { BlobbiStageVisual } from '@/blobbi/ui/BlobbiStageVisual';
import { companionDataToBlobbi } from '@/blobbi/ui/lib/adapters';
import { useEffectiveEmotion } from '@/blobbi/dev/useEmotionDev';
import { useRecipeFingerprint, useFillLevelUpdate } from '@/blobbi/ui/hooks/useFillLevelUpdate';
import type { BlobbiEmotion } from '@/blobbi/ui/lib/emotion-types';
import type { BlobbiVisualRecipe } from '@/blobbi/ui/lib/recipe';
import type { BodyEffectsSpec } from '@/blobbi/ui/lib/bodyEffects';
import type { Blobbi } from '@blobbi-kit/core/types/blobbi';
import type { BlobbiCompanion } from '@blobbi-kit/core/blobbi';
import { cn } from '@/lib/utils';
import type { CompanionData, EyeOffset, CompanionDirection } from '../types/companion.types';
import { calculateFloatAnimation, type FloatOffset } from '../utils/animation';

// ─── Props ────────────────────────────────────────────────────────────────────

interface BlobbiCompanionVisualProps {
  companion: CompanionData;
  size: number;
  eyeOffsetRef: RefObject<EyeOffset>;
  direction: CompanionDirection;
  isDragging: boolean;
  isWalking: boolean;
  /** Whether the gentle float/bob animation is applied. */
  floatActive?: boolean;
  /** Called with the current float offset each time it is applied. */
  onFloatFrame?: (offset: FloatOffset) => void;
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
// STABILITY CONTRACT:
// This component is the boundary that protects the SVG DOM subtree from the
// companion rerender storm (~60 renders/s while walking or being dragged).
// It renders BlobbiAdultVisual / BlobbiBabyVisual with renderMode="companion".
//
// It MUST only rerender when actual visual STRUCTURE changes:
//   blobbi, recipeFingerprint, recipeLabel, emotion, bodyEffects, stage
//
// It uses recipeFingerprint (not recipe reference) so that level-only
// changes (e.g. nausea drain) do NOT trigger rerenders. The fill level
// is updated imperatively from BlobbiCompanionVisual via useFillLevelUpdate.
//
// It MUST NOT receive or depend on per-frame values:
//   eyeOffset value, floatOffset, isDragging, isWalking, position, animationTime
//
// The eyeOffsetRef is a stable React ref — its identity never changes,
// so it is safe to pass without triggering rerenders.

interface MemoizedBlobbiVisualProps {
  stage: 'baby' | 'adult';
  blobbi: Blobbi;
  eyeOffsetRef: RefObject<EyeOffset>;
  recipe?: BlobbiVisualRecipe;
  /** Pre-computed structural fingerprint (excludes angerRise.level). */
  recipeFingerprint: string;
  recipeLabel?: string;
  emotion: BlobbiEmotion;
  bodyEffects?: BodyEffectsSpec;
}

const MemoizedBlobbiVisual = memo(function MemoizedBlobbiVisual({
  stage,
  blobbi,
  eyeOffsetRef,
  recipe,
  recipeFingerprint: _recipeFingerprint,
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
    // Compare blobbi by visual-identity primitives, NOT by reference.
    // This prevents SVG rebuilds (and SMIL animation restarts) when the
    // upstream companion object gets a new reference with identical content
    // — e.g. during nausea recovery where only angerRise.level changes.
    prev.blobbi.id === next.blobbi.id &&
    prev.blobbi.baseColor === next.blobbi.baseColor &&
    prev.blobbi.secondaryColor === next.blobbi.secondaryColor &&
    prev.blobbi.eyeColor === next.blobbi.eyeColor &&
    prev.blobbi.adult?.evolutionForm === next.blobbi.adult?.evolutionForm &&
    prev.blobbi.seed === next.blobbi.seed &&
    prev.recipeFingerprint === next.recipeFingerprint &&
    prev.recipeLabel === next.recipeLabel &&
    prev.emotion === next.emotion &&
    prev.bodyEffects === next.bodyEffects
  );
});

// ─── Float helpers ────────────────────────────────────────────────────────────

const ZERO_FLOAT: FloatOffset = { x: 0, y: 0, rotation: 0 };

const SHADOW_FADE_DISTANCE = 30;
const SHADOW_MAX_OPACITY = 0.35;

function floatTransform(offset: FloatOffset): string | undefined {
  const transforms: string[] = [];
  if (offset.x !== 0 || offset.y !== 0) {
    transforms.push(`translate(${offset.x}px, ${offset.y}px)`);
  }
  if (offset.rotation !== 0) {
    transforms.push(`rotate(${offset.rotation}deg)`);
  }
  return transforms.length > 0 ? transforms.join(' ') : undefined;
}

function floatWrapperTransform(size: number, offset: FloatOffset): string {
  return [`translateY(${size * 0.12}px)`, floatTransform(offset)].filter(Boolean).join(' ');
}

function shadowStyle(groundFadeRatio: number, floatY: number) {
  const floatFadeRatio = Math.max(0.85, 1 - Math.abs(floatY) * 0.02);
  const opacity = SHADOW_MAX_OPACITY * groundFadeRatio * floatFadeRatio;
  const scale = 0.9 + 0.1 * groundFadeRatio * floatFadeRatio;
  return {
    shadowOpacity: opacity,
    transform: `translateX(-50%) scaleX(${scale})`,
    background: `radial-gradient(ellipse at center, rgba(0,0,0,${opacity}) 0%, rgba(0,0,0,${opacity * 0.5}) 40%, transparent 70%)`,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BlobbiCompanionVisual({
  companion,
  size,
  eyeOffsetRef,
  direction,
  isDragging,
  isWalking,
  floatActive = false,
  onFloatFrame,
  isOnGround = true,
  distanceFromGround = 0,
  recipe: recipeProp,
  recipeLabel: recipeLabelProp,
  emotion: emotionProp,
  bodyEffects: bodyEffectsProp,
  className,
  debugMode = false,
}: BlobbiCompanionVisualProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const blobbi = useMemo(() => companionDataToBlobbi(companion), [companion]);

  // DEV ONLY: Get effective emotion from dev context (overrides production emotions)
  const devEmotion = useEffectiveEmotion();
  const hasDevOverride = devEmotion !== 'neutral';

  const effectiveRecipe = hasDevOverride ? undefined : recipeProp;
  const effectiveRecipeLabel = hasDevOverride ? undefined : recipeLabelProp;
  const effectiveEmotion = hasDevOverride ? devEmotion : (emotionProp ?? 'neutral');
  const effectiveBodyEffects = hasDevOverride ? undefined : bodyEffectsProp;

  // ── Fill level update (above memo boundary) ────────────────────────────────
  // Compute structural fingerprint (excludes angerRise.level) and run the
  // imperative gradient-stop update from here. This allows MemoizedBlobbiVisual
  // to block re-renders during level-only changes (e.g. nausea drain), keeping
  // SMIL spiral-eye animations running uninterrupted.
  const recipeFingerprint = useRecipeFingerprint(effectiveRecipe);
  useFillLevelUpdate(rootRef, blobbi.id, effectiveRecipe);

  // Reaction state for CSS animations on the OUTER wrapper
  // When sleeping, always idle — no swaying/happy animation
  const isSleeping = companion.state === 'sleeping';
  const reaction = isSleeping ? 'idle' : isDragging ? 'happy' : isWalking ? 'swaying' : 'idle';

  // ── Shadow ─────────────────────────────────────────────────────────────────
  // Rendered without float; the float loop below refines transform/background.
  const showShadow = isOnGround && !isDragging && distanceFromGround < SHADOW_FADE_DISTANCE;
  const groundFadeRatio = Math.max(0, 1 - distanceFromGround / SHADOW_FADE_DISTANCE);
  const shadow = shadowStyle(groundFadeRatio, 0);

  // ── Float animation ────────────────────────────────────────────────────────
  // Gentle sway/float applied straight to the DOM. Driving this through React
  // state rerendered the whole companion tree ~30 times a second while the
  // Blobbi stood still. Capped at ~30fps (the float sines are ≤1.2Hz, so
  // higher rates are invisible); a single static frame for reduced motion.
  const floatWrapperRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  // Mount-relative clock, so pausing/resuming the loop keeps the float phase.
  const floatStartRef = useRef<number>(performance.now());
  const onFloatFrameRef = useRef(onFloatFrame);
  const groundFadeRatioRef = useRef(groundFadeRatio);

  useLayoutEffect(() => {
    onFloatFrameRef.current = onFloatFrame;
    groundFadeRatioRef.current = groundFadeRatio;
  });

  useEffect(() => {
    const apply = (offset: FloatOffset) => {
      const wrapper = floatWrapperRef.current;
      if (wrapper) wrapper.style.transform = floatWrapperTransform(size, offset);
      const shadowEl = shadowRef.current;
      if (shadowEl) {
        const { transform, background } = shadowStyle(groundFadeRatioRef.current, offset.y);
        shadowEl.style.transform = transform;
        shadowEl.style.background = background;
      }
      onFloatFrameRef.current?.(offset);
    };

    if (!floatActive) {
      apply(ZERO_FLOAT);
      return;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      apply(calculateFloatAnimation(0, isWalking));
      return;
    }

    let animationId: number;
    let lastUpdate = 0;

    const animate = (time: number) => {
      if (time - lastUpdate >= 33) {
        lastUpdate = time;
        apply(calculateFloatAnimation(time - floatStartRef.current, isWalking));
      }
      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, [floatActive, isWalking, size]);

  // direction is accepted for API completeness but not currently used for rendering
  // (Blobbi does not flip based on facing direction). Suppress unused warning.
  void direction;

  return (
    <div
      ref={rootRef}
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
      {!debugMode && showShadow && shadow.shadowOpacity > 0.01 && (
        <div
          ref={shadowRef}
          className="absolute pointer-events-none"
          style={{
            bottom: -20,
            left: '50%',
            width: size * 0.5,
            height: size * 0.08,
            transform: shadow.transform,
            background: shadow.background,
            borderRadius: '50%',
            filter: 'blur(4px)',
            opacity: groundFadeRatio,
            transition: 'opacity 0.15s ease-out, transform 0.1s ease-out',
          }}
        />
      )}

      {/*
        Float wrapper — owns translateY alignment + JS float offset.
        This is a separate element from the sway wrapper below so that
        the CSS animation on the sway wrapper does not override the
        inline transform here. (CSS @keyframes replace the entire
        `transform` property while active, which would drop the
        translateY alignment shift and cause Blobbi to float above
        the ground during walking.)
      */}
      <div
        ref={floatWrapperRef}
        className="size-full"
        style={{
          transform: floatWrapperTransform(size, ZERO_FLOAT),
          transformOrigin: 'center bottom',
          transition: isDragging ? 'none' : 'transform 0.05s ease-out',
          ...(debugMode ? { outline: '2px dashed magenta' } : {}),
        }}
      >
        {/* Sway wrapper — CSS rotation only, no positioning transforms */}
        <div
          className={cn(
            'size-full',
            (reaction === 'swaying' || reaction === 'happy') && 'animate-blobbi-sway',
          )}
          style={{ transformOrigin: 'center bottom' }}
        >
          {companion.stage === 'egg' ? (
            <BlobbiStageVisual
              companion={companion as unknown as BlobbiCompanion}
              size="sm"
              animated={false}
              className="size-full"
            />
          ) : (
            <MemoizedBlobbiVisual
              stage={companion.stage}
              blobbi={blobbi}
              eyeOffsetRef={eyeOffsetRef}
              recipe={effectiveRecipe}
              recipeFingerprint={recipeFingerprint}
              recipeLabel={effectiveRecipeLabel}
              emotion={effectiveEmotion}
              bodyEffects={effectiveBodyEffects}
            />
          )}
        </div>
      </div>
    </div>
  );
}
