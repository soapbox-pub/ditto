/**
 * BlobbiCompanionVisual
 *
 * Visual component for rendering the companion Blobbi.
 * Supports external eye offset control for custom gaze behavior.
 */

import { useMemo, useRef } from 'react';

import { BlobbiBabyVisual } from '@/blobbi/ui/BlobbiBabyVisual';
import { BlobbiAdultVisual } from '@/blobbi/ui/BlobbiAdultVisual';
import { companionDataToBlobbi } from '@/blobbi/ui/lib/adapters';
import { useEffectiveEmotion } from '@/blobbi/dev/EmotionDevContext';
import type { BlobbiEmotion } from '@/blobbi/ui/lib/emotion-types';
import type { BlobbiVisualRecipe } from '@/blobbi/ui/lib/recipe';
import type { BodyEffectsSpec } from '@/blobbi/ui/lib/bodyEffects';
import { cn } from '@/lib/utils';
import type { CompanionData, EyeOffset, CompanionDirection } from '../types/companion.types';

interface BlobbiCompanionVisualProps {
  /** Companion data */
  companion: CompanionData;
  /** Size in pixels */
  size: number;
  /** Eye offset for gaze direction */
  eyeOffset: EyeOffset;
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



export function BlobbiCompanionVisual({
  companion,
  size,
  eyeOffset,
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
  
  // Final rendering: dev override > props from status reaction system
  const effectiveRecipe = hasDevOverride ? undefined : recipeProp;
  const effectiveRecipeLabel = hasDevOverride ? undefined : recipeLabelProp;
  const effectiveEmotion = hasDevOverride ? devEmotion : (emotionProp ?? 'neutral');
  const effectiveBodyEffects = hasDevOverride ? undefined : bodyEffectsProp;
  
  // Eye offset is now passed directly to the visual components via externalEyeOffset prop
  // This is more reliable than DOM manipulation which can be overwritten by useBlobbiEyes
  
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
  
  // Determine reaction state
  const reaction = isDragging ? 'happy' : isWalking ? 'idle' : 'idle';
  
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
        className="size-full"
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
        {companion.stage === 'baby' && (
          <BlobbiBabyVisual
            blobbi={blobbi}
            reaction={reaction}
            lookMode="forward"
            externalEyeOffset={eyeOffset}
            recipe={effectiveRecipe}
            recipeLabel={effectiveRecipeLabel}
            emotion={effectiveEmotion}
            bodyEffects={effectiveBodyEffects}
            className="size-full"
          />
        )}
        {companion.stage === 'adult' && (
          <BlobbiAdultVisual
            blobbi={blobbi}
            reaction={reaction}
            lookMode="forward"
            externalEyeOffset={eyeOffset}
            recipe={effectiveRecipe}
            recipeLabel={effectiveRecipeLabel}
            emotion={effectiveEmotion}
            bodyEffects={effectiveBodyEffects}
            className="size-full"
          />
        )}
      </div>
    </div>
  );
}
