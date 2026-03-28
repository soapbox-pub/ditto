/**
 * BlobbiBabyVisual - Reusable component for rendering Blobbi babies
 *
 * Uses the baby-blobbi module for SVG resolution and customization.
 * Handles awake vs sleeping states automatically.
 * Eyes always track the mouse cursor in real-time.
 */

import { useMemo, useRef, useEffect } from 'react';

import { resolveBabySvg, customizeBabySvgFromBlobbi } from '@/blobbi/baby-blobbi';
import { addEyeAnimation } from './lib/eye-animation';
import { applyEmotion, type BlobbiEmotion } from './lib/emotions';
import { useBlobbiEyes, type BlobbiLookMode } from './lib/useBlobbiEyes';
import { cn } from '@/lib/utils';
import type { Blobbi } from '@/blobbi/core/types/blobbi';
import { isBlobbiSleeping } from '@/blobbi/core/types/blobbi';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Reaction states for baby Blobbi animations
 */
export type BabyReactionState = 'idle' | 'listening' | 'swaying' | 'singing' | 'happy';

/**
 * External eye offset for companion control
 * Values range from -1 to 1, converted to pixel movement internally
 */
export interface ExternalEyeOffset {
  x: number;
  y: number;
}

export interface BlobbiBabyVisualProps {
  /** The Blobbi data */
  blobbi: Blobbi;
  /** Reaction state for music/sing animations */
  reaction?: BabyReactionState;
  /** Controls eye tracking behavior (default: 'follow-pointer') */
  lookMode?: BlobbiLookMode;
  /** Disable blinking animation (for photo/export mode) */
  disableBlink?: boolean;
  /** 
   * External eye offset from companion system.
   * When provided, bypasses internal mouse tracking and uses this offset directly.
   * Values should be -1 to 1, will be converted to pixel movement.
   */
  externalEyeOffset?: ExternalEyeOffset;
  /** 
   * Emotional state to display.
   * Adds visual overlays like eyebrows, modified mouth, and tears.
   * Default: 'neutral' (no modifications)
   */
  emotion?: BlobbiEmotion;
  /** Additional CSS classes for the container */
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Renders a baby Blobbi using inline SVG.
 *
 * - Resolves the correct SVG (awake or sleeping) based on state
 * - Applies color customization from Blobbi traits
 * - Eyes always track the mouse cursor (instant, real-time)
 * - Renders safely using dangerouslySetInnerHTML
 */
export function BlobbiBabyVisual({ blobbi, reaction = 'idle', lookMode = 'follow-pointer', disableBlink = false, externalEyeOffset, emotion = 'neutral', className }: BlobbiBabyVisualProps) {
  const isSleeping = isBlobbiSleeping(blobbi);
  const containerRef = useRef<HTMLDivElement>(null);

  // Disable reactions when sleeping
  const effectiveReaction = isSleeping ? 'idle' : reaction;

  // Eye animation hook - handles DOM manipulation internally
  // When externalEyeOffset is provided, we disable tracking but keep blinking
  useBlobbiEyes(containerRef, {
    isSleeping,
    maxMovement: 2,
    lookMode,
    disableBlink,
    disableTracking: !!externalEyeOffset, // External system controls eye position
  });

  // External eye offset control - applies offset directly when provided
  // This bypasses useBlobbiEyes and gives companion full control
  useEffect(() => {
    if (!externalEyeOffset || !containerRef.current || isSleeping) return;

    const eyeElements = containerRef.current.querySelectorAll<SVGGElement>('.blobbi-eye-left, .blobbi-eye-right');
    if (eyeElements.length === 0) return;

    // Convert -1 to 1 offset to pixel movement
    // Increased max movement for more visible eye tracking (4px horizontal)
    const maxMovementX = 4;
    const x = externalEyeOffset.x * maxMovementX;
    
    // Asymmetric vertical movement:
    // - Upward (negative y): stronger movement (1.0x) for clear "looking up" effect
    // - Downward (positive y): reduced movement (0.6x) to avoid looking too droopy
    // Y offset: -1 = looking up, +1 = looking down
    const maxMovementYUp = 4;    // Full range for looking up
    const maxMovementYDown = 2.4; // Reduced range for looking down (0.6x)
    const y = externalEyeOffset.y < 0 
      ? externalEyeOffset.y * maxMovementYUp    // Looking up: full range
      : externalEyeOffset.y * maxMovementYDown; // Looking down: reduced range

    eyeElements.forEach(el => {
      el.setAttribute('transform', `translate(${x} ${y})`);
    });
  }, [externalEyeOffset, isSleeping]);

  // Memoize the customized SVG to avoid unnecessary processing
  const customizedSvg = useMemo(() => {
    const baseSvg = resolveBabySvg(blobbi, { isSleeping });
    const colorizedSvg = customizeBabySvgFromBlobbi(baseSvg, blobbi, isSleeping);

    // Add eye animation wrappers (only when not sleeping)
    if (!isSleeping) {
      // Pass base color for eyelid generation
      let animatedSvg = addEyeAnimation(colorizedSvg, { baseColor: blobbi.baseColor, instanceId: blobbi.id });
      
      // Apply emotion overlays (eyebrows, sad mouth, tears, etc.)
      // Pass 'baby' variant for baby-specific adjustments (e.g., eyebrow positioning)
      if (emotion !== 'neutral') {
        animatedSvg = applyEmotion(animatedSvg, emotion, 'baby');
      }
      
      return animatedSvg;
    }

    return colorizedSvg;
  }, [blobbi, isSleeping, emotion]);

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative flex items-center justify-center',
        // Reduced opacity when sleeping for visual feedback
        isSleeping && 'opacity-70',
        // Reaction animations for baby
        (effectiveReaction === 'listening' ||
          effectiveReaction === 'swaying' ||
          effectiveReaction === 'happy') &&
          'animate-blobbi-sway',
        effectiveReaction === 'singing' && 'animate-blobbi-bounce',
        className
      )}
      // Safe: SVG content comes from our own trusted module
      dangerouslySetInnerHTML={{ __html: customizedSvg }}
    />
  );
}
