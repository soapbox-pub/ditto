/**
 * BlobbiCompanionVisual
 *
 * Visual component for rendering the companion Blobbi.
 *
 * Architecture:
 * - Outer shell: handles per-frame updates (float, shadow, drag state) — rerenders freely
 * - Inner MemoizedBlobbiVisual: renders the actual SVG — only rerenders when visual inputs change
 * - Eye gaze is driven imperatively via ref (no React rerenders for gaze)
 */

import { useMemo, useRef, memo, type RefObject } from 'react';

import { BlobbiBabyVisual } from '@/blobbi/ui/BlobbiBabyVisual';
import { BlobbiAdultVisual } from '@/blobbi/ui/BlobbiAdultVisual';
import { companionDataToBlobbi } from '@/blobbi/ui/lib/adapters';
import { useEffectiveEmotion } from '@/blobbi/dev/EmotionDevContext';
import type { BlobbiEmotion } from '@/blobbi/ui/lib/emotion-types';
import type { BlobbiVisualRecipe } from '@/blobbi/ui/lib/recipe';
import type { BodyEffectsSpec } from '@/blobbi/ui/lib/bodyEffects';
// BlobbiReactionState not needed — reaction classes applied on outer wrapper, not passed to memoized visual
import type { Blobbi } from '@/blobbi/core/types/blobbi';
import { cn } from '@/lib/utils';
import type { CompanionData, EyeOffset, CompanionDirection } from '../types/companion.types';

interface BlobbiCompanionVisualProps {
  /** Companion data */
  companion: CompanionData;
  /** Size in pixels */
  size: number;
  /** Ref-based eye offset for imperative gaze control (no rerenders) */
  eyeOffsetRef: RefObject<EyeOffset>;
  /** Facing direction (used for gaze, not for flipping) */
  direction: CompanionDirection;
  /** Whether the companion is being dragged */
  isDragging: boolean;
  /** Whether the companion is walking */
  isWalking: boolean;
  /** Floating animation offset for gentle sway */
  floatOffset?: { x: number; y: number; rotation: number };
  /** Whether Blobbi is on or near the ground (affects shadow visibility) */
  isOnGround?: boolean;
  /** Distance from ground in pixels (for shadow fade, 0 = on ground) */
  distanceFromGround?: number;
  /** Pre-resolved visual recipe. Takes precedence over `emotion`. */
  recipe?: BlobbiVisualRecipe;
  /** Label for the recipe (CSS class names). */
  recipeLabel?: string;
  /** Named emotion preset (convenience). Ignored when `recipe` is provided. */
  emotion?: BlobbiEmotion;
  /**
   * Body-level visual effects — for manual/external use only.
   * Status-reaction body effects are already folded into the recipe.
   */
  bodyEffects?: BodyEffectsSpec;
  /** Additional class names */
  className?: string;
  /** Debug mode - shows visual boundaries */
  debugMode?: boolean;
}

// ─── Memoized Inner Visual ────────────────────────────────────────────────────
//
// This component renders the actual Blobbi SVG (BlobbiAdultVisual / BlobbiBabyVisual).
// It is wrapped in React.memo with a custom comparator so it only rerenders when
// the actual visual inputs change — NOT when per-frame props like floatOffset,
// isDragging, isWalking, or eyeOffset change.
//
// Eye gaze is controlled imperatively: the ref is passed to useExternalEyeOffset
// inside the visual components, which reads from it in its own RAF loop.

interface MemoizedBlobbiVisualProps {
  stage: 'baby' | 'adult';
  blobbi: Blobbi;
  eyeOffsetRef: RefObject<EyeOffset>;
  recipe?: BlobbiVisualRecipe;
  recipeLabel?: string;
  emotion: BlobbiEmotion;
  bodyEffects?: BodyEffectsSpec;
}

/**
 * Memoized inner visual — renders the actual SVG.
 * 
 * Does NOT receive reaction/walking/dragging props.
 * CSS sway/bounce classes are applied on an outer wrapper in BlobbiCompanionVisual.
 * This component only rerenders when visual content (recipe, emotion, blobbi data) changes.
 */
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
  // Custom comparator: only rerender when visual inputs change
  return (
    prev.stage === next.stage &&
    prev.blobbi === next.blobbi &&
    prev.recipe === next.recipe &&
    prev.recipeLabel === next.recipeLabel &&
    prev.emotion === next.emotion &&
    prev.bodyEffects === next.bodyEffects
    // eyeOffsetRef is a stable ref — never changes identity
  );
});

// ─── DEBUG: Companion prop stability ──────────────────────────────────────────
const _visualRenderCount = { current: 0 };
const _visualPrevCompanionRef = { current: null as CompanionData | null };
const _visualPrevBlobbiRef = { current: null as ReturnType<typeof companionDataToBlobbi> | null };
// ──────────────────────────────────────────────────────────────────────────────

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

  // ─── DEBUG: Track companion → blobbi object stability ─────────────────
  _visualRenderCount.current++;
  if (_visualRenderCount.current <= 5 || _visualRenderCount.current % 100 === 0) {
    console.log(`[CompanionVisual] render #${_visualRenderCount.current}`);
  }
  if (companion !== _visualPrevCompanionRef.current) {
    console.log(`%c[CompanionVisual] companion REFERENCE changed (render #${_visualRenderCount.current})`, 'color: #8b5cf6; font-weight: bold');
    _visualPrevCompanionRef.current = companion;
  }
  if (blobbi !== _visualPrevBlobbiRef.current) {
    console.log(`%c[CompanionVisual] blobbi REFERENCE changed (render #${_visualRenderCount.current}) — this triggers SVG rebuild`, 'color: #ef4444; font-weight: bold');
    _visualPrevBlobbiRef.current = blobbi;
  }
  // ─────────────────────────────────────────────────────────────────────────
  
  // DEV ONLY: Get effective emotion from dev context (overrides production emotions)
  const devEmotion = useEffectiveEmotion();
  const hasDevOverride = devEmotion !== 'neutral';
  
  // Final rendering: dev override > props from status reaction system
  const effectiveRecipe = hasDevOverride ? undefined : recipeProp;
  const effectiveRecipeLabel = hasDevOverride ? undefined : recipeLabelProp;
  const effectiveEmotion = hasDevOverride ? devEmotion : (emotionProp ?? 'neutral');
  const effectiveBodyEffects = hasDevOverride ? undefined : bodyEffectsProp;
  
  // Build transform for floating animation
  // No flipping based on direction - Blobbi always faces the same way
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
  
  // Determine reaction state for CSS animations
  // - happy: when being dragged (Blobbi enjoys interaction)
  // - swaying: when walking (natural movement animation)
  // - idle: default state
  const reaction = isDragging ? 'happy' : isWalking ? 'swaying' : 'idle';
  
  // Shadow visibility and appearance based on ground proximity
  // Shadow should only appear when Blobbi is on or very near the ground
  const SHADOW_FADE_DISTANCE = 30; // Shadow fully fades at this distance from ground
  const SHADOW_MAX_OPACITY = 0.35;
  
  // Calculate shadow visibility based on actual ground distance, not just float offset
  const showShadow = isOnGround && !isDragging && distanceFromGround < SHADOW_FADE_DISTANCE;
  
  // Shadow fades as Blobbi gets farther from ground
  // Also factor in the float animation offset for subtle breathing effect
  const floatHeight = Math.abs(floatOffset.y);
  const groundFadeRatio = Math.max(0, 1 - distanceFromGround / SHADOW_FADE_DISTANCE);
  const floatFadeRatio = Math.max(0.85, 1 - floatHeight * 0.02); // Subtle fade during float
  const shadowOpacity = SHADOW_MAX_OPACITY * groundFadeRatio * floatFadeRatio;
  const shadowScale = 0.9 + 0.1 * groundFadeRatio * floatFadeRatio; // Slightly smaller when lifting
  
  // Suppress unused variable warning for direction (kept for API compatibility)
  void direction;
  
  return (
    <div 
      ref={containerRef}
      className={cn('relative', className)}
      style={{ width: size, height: size }}
    >
      {/* DEBUG: Container and alignment markers */}
      {debugMode && (
        <>
          {/* Container outline - lime */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              border: '2px solid lime',
              boxSizing: 'border-box',
            }}
          />
          {/* 88% line from top (where SVG body bottom should be before shift) - yellow */}
          <div
            className="absolute pointer-events-none"
            style={{
              top: `${size * 0.88}px`,
              left: 0,
              right: 0,
              height: 2,
              backgroundColor: 'yellow',
            }}
          />
          {/* 100% line (container bottom where body should touch after shift) - cyan */}
          <div
            className="absolute pointer-events-none"
            style={{
              bottom: 0,
              left: 0,
              right: 0,
              height: 2,
              backgroundColor: 'cyan',
            }}
          />
          {/* Label showing the expected shift */}
          <div
            className="absolute pointer-events-none"
            style={{
              top: 2,
              left: 2,
              fontSize: 8,
              color: 'white',
              backgroundColor: 'black',
              padding: '1px 2px',
            }}
          >
            shift: {size * 0.12}px
          </div>
        </>
      )}
      
      {/* Floor shadow - only visible when Blobbi is on/near the ground */}
      {/* Hidden during: dragging, entry animations, falling, or when far from ground */}
      {!debugMode && showShadow && shadowOpacity > 0.01 && (
        <div
          className="absolute pointer-events-none"
          style={{
            // Position shadow well below Blobbi to feel like it's on the floor
            bottom: -20,
            left: '50%',
            width: size * 0.5,
            height: size * 0.08,
            transform: `translateX(-50%) scaleX(${shadowScale})`,
            background: `radial-gradient(ellipse at center, rgba(0,0,0,${shadowOpacity}) 0%, rgba(0,0,0,${shadowOpacity * 0.5}) 40%, transparent 70%)`,
            borderRadius: '50%',
            filter: 'blur(4px)',
            opacity: groundFadeRatio, // Additional opacity control for smooth fade
            transition: 'opacity 0.15s ease-out, transform 0.1s ease-out',
          }}
        />
      )}
      
      {/* Blobbi visual with floating transform */}
      {/* 
        The Blobbi SVG has empty space: 15% at top (body starts at y=15), 12% at bottom (body ends at y=88).
        To align the visible body bottom with the container bottom, we shift down by 12% of container size.
        This is applied BEFORE the float transform so the ground position is correct.
      */}
      <div
        className={cn(
          'size-full',
          // Reaction CSS animations applied HERE (outer wrapper), not on the SVG container.
          // This prevents className changes from triggering dangerouslySetInnerHTML replacement.
          // Companion reactions: 'swaying' (walking), 'happy' (dragging), 'idle' (default)
          (reaction === 'swaying' || reaction === 'happy') && 'animate-blobbi-sway',
        )}
        style={{
          // First apply the SVG alignment correction, then the float animation
          // The 12% shift pushes the SVG down so its visible body bottom aligns with container bottom
          transform: [
            `translateY(${size * 0.12}px)`,  // SVG body alignment correction
            blobbiTransform,                  // Float animation (if any)
          ].filter(Boolean).join(' ') || undefined,
          transformOrigin: 'center bottom',
          transition: isDragging ? 'none' : 'transform 0.05s ease-out',
          // DEBUG: Show the shifted wrapper
          ...(debugMode ? { outline: '2px dashed magenta' } : {}),
        }}
      >
        {/* Memoized visual: only rerenders when visual inputs change */}
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
