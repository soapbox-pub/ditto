/**
 * BlobbiAdultVisual - Reusable component for rendering Blobbi adults
 *
 * Uses the adult-blobbi module for SVG resolution and customization.
 * Handles awake vs sleeping states automatically.
 * Supports multiple adult evolution forms.
 * Eyes always track the mouse cursor in real-time.
 */

import { useMemo, useRef } from 'react';

import { resolveAdultSvgWithForm, customizeAdultSvgFromBlobbi } from '@/blobbi/adult-blobbi';
import { cn } from '@/lib/utils';
import { sanitizeBlobbiSvg } from '@/lib/sanitizeBlobbiSvg';

import { addEyeAnimation } from './lib/eye-animation';
import { applyEmotion, type BlobbiEmotion } from './lib/emotions';
import { applyBodyEffects, type BodyEffectsSpec } from './lib/bodyEffects';
import { useBlobbiEyes, type BlobbiLookMode } from './lib/useBlobbiEyes';
import { useExternalEyeOffset } from './lib/useExternalEyeOffset';
import type { ExternalEyeOffset, BlobbiReactionState } from './lib/types';
import type { Blobbi } from '@/blobbi/core/types/blobbi';
import { isBlobbiSleeping } from '@/blobbi/core/types/blobbi';

// Re-export types for backwards compatibility
export type { ExternalEyeOffset };

/**
 * Reaction states for adult Blobbi animations
 * @deprecated Use BlobbiReactionState from './lib/types' instead
 */
export type AdultReactionState = BlobbiReactionState;

export interface BlobbiAdultVisualProps {
  /** The Blobbi data */
  blobbi: Blobbi;
  /** Reaction state for music/sing animations */
  reaction?: AdultReactionState;
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
  /**
   * Base emotion for overlay animations.
   * When emotion is an overlay (like 'sleepy'), this base emotion is applied first,
   * then the overlay animates on top of it.
   * Example: baseEmotion='boring', emotion='sleepy' → boring face with sleepy animation
   */
  baseEmotion?: BlobbiEmotion;
  /**
   * Body-level visual effects (dirt marks, stink clouds, etc.).
   * Applied independently of face emotions — can stack with any face state.
   */
  bodyEffects?: BodyEffectsSpec;
  /** Additional CSS classes for the container */
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Renders an adult Blobbi using inline SVG.
 *
 * - Resolves the correct form from blobbi data (evolutionForm or seed-derived)
 * - Selects the correct SVG variant (awake or sleeping) based on state
 * - Applies color customization from Blobbi traits
 * - Eyes always track the mouse cursor (instant, real-time)
 * - Renders safely using dangerouslySetInnerHTML
 */
export function BlobbiAdultVisual({ blobbi, reaction = 'idle', lookMode = 'follow-pointer', disableBlink = false, externalEyeOffset, emotion = 'neutral', baseEmotion, bodyEffects, className }: BlobbiAdultVisualProps) {
  const isSleeping = isBlobbiSleeping(blobbi);
  const containerRef = useRef<HTMLDivElement>(null);

  // Disable reactions when sleeping
  const effectiveReaction = isSleeping ? 'idle' : reaction;

  // Eye animation hook - handles DOM manipulation internally
  // When externalEyeOffset is provided, we disable tracking but keep blinking
  useBlobbiEyes(containerRef, {
    isSleeping,
    maxMovement: 2.5, // Slightly more movement for larger adult form
    lookMode,
    disableBlink,
    disableTracking: !!externalEyeOffset, // External system controls eye position
  });

  // External eye offset control - applies offset directly when provided
  // This bypasses useBlobbiEyes and gives companion full control
  useExternalEyeOffset({
    containerRef,
    externalEyeOffset,
    isSleeping,
    variant: 'adult',
  });

  // Memoize the customized SVG to avoid unnecessary processing
  const customizedSvg = useMemo(() => {
    // Get form and base SVG
    const { form, svg } = resolveAdultSvgWithForm(blobbi, { isSleeping });

    // Apply color customization
    const colorizedSvg = customizeAdultSvgFromBlobbi(svg, form, blobbi, isSleeping);

    // Add eye animation wrappers when awake (eyes are closed when sleeping)
    if (!isSleeping) {
      // Pass base color for eyelid generation
      let animatedSvg = addEyeAnimation(colorizedSvg, { baseColor: blobbi.baseColor, instanceId: blobbi.id });
      
      // Apply base emotion first (if provided)
      // Base emotions set the persistent face state (boring, dirty, dizzy, etc.)
      if (baseEmotion && baseEmotion !== 'neutral') {
        animatedSvg = applyEmotion(animatedSvg, baseEmotion, 'adult', form, blobbi.id);
      }
      
      // Apply primary emotion
      // If this is an overlay emotion (sleepy), it will animate on top of the base
      // If this is a regular emotion and no baseEmotion was provided, it acts as the base
      if (emotion !== 'neutral') {
        animatedSvg = applyEmotion(animatedSvg, emotion, 'adult', form, blobbi.id);
      }
      
      // Apply body effects (independent of face emotions)
      if (bodyEffects) {
        // Pass blobbi.id for stable SVG element IDs
        animatedSvg = applyBodyEffects(animatedSvg, { ...bodyEffects, idPrefix: bodyEffects.idPrefix ?? blobbi.id });
      }
      
      return animatedSvg;
    }

    return colorizedSvg;
  }, [blobbi, isSleeping, emotion, baseEmotion, bodyEffects]);

  // Defense-in-depth: sanitize the final SVG before DOM injection.
  // The upstream pipeline validates inputs (normalizeHexColor, instanceId sanitization),
  // but this catches anything unexpected from the 3000+ lines of SVG string manipulation.
  const safeSvg = useMemo(() => sanitizeBlobbiSvg(customizedSvg), [customizedSvg]);

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative flex items-center justify-center',
        // Reduced opacity when sleeping for visual feedback
        isSleeping && 'opacity-70',
        // Reaction animations for adult
        (effectiveReaction === 'listening' ||
          effectiveReaction === 'swaying' ||
          effectiveReaction === 'happy') &&
          'animate-blobbi-sway',
        effectiveReaction === 'singing' && 'animate-blobbi-bounce',
        className
      )}
      dangerouslySetInnerHTML={{ __html: safeSvg }}
    />
  );
}
