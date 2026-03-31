/**
 * BlobbiAdultVisual - Reusable component for rendering Blobbi adults
 *
 * Uses the adult-blobbi module for SVG resolution and customization.
 * Handles awake vs sleeping states automatically.
 * Supports multiple adult evolution forms.
 * Eyes always track the mouse cursor in real-time.
 *
 * Accepts either:
 *   - `recipe` + `recipeLabel`: a pre-resolved visual recipe (recipe-first path
 *     from useStatusReaction). The recipe includes body effects — no separate
 *     bodyEffects prop is needed for this path.
 *   - `emotion`: a named emotion preset (convenience path, resolved internally)
 *
 * An optional `bodyEffects` prop is available for manual/external use cases
 * outside the status reaction system (e.g. dev tools, previews). It is NOT
 * fed from useStatusReaction to avoid double-applying body effects.
 */

import { useMemo, useRef, useEffect, type RefObject } from 'react';

import { resolveAdultSvgWithForm, customizeAdultSvgFromBlobbi } from '@/blobbi/adult-blobbi';
import { cn } from '@/lib/utils';
import { sanitizeBlobbiSvg } from '@/lib/sanitizeBlobbiSvg';

import { addEyeAnimation } from './lib/eye-animation';
import { resolveVisualRecipe, applyVisualRecipe, type BlobbiVisualRecipe } from './lib/recipe';
import type { BlobbiEmotion } from './lib/emotion-types';
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
   * External eye offset from companion system (value-based — causes rerenders).
   * When provided, bypasses internal mouse tracking and uses this offset directly.
   */
  externalEyeOffset?: ExternalEyeOffset;
  /**
   * Ref-based external eye offset (imperative — no rerenders).
   * Preferred for companion mode. When provided, takes precedence over externalEyeOffset.
   */
  externalEyeOffsetRef?: RefObject<ExternalEyeOffset>;
  /** 
   * Pre-resolved visual recipe. When provided, takes precedence over `emotion`.
   * This is the recipe-first rendering path used by useStatusReaction.
   */
  recipe?: BlobbiVisualRecipe;
  /**
   * Label for the recipe (used in CSS class names). Required when `recipe` is provided.
   */
  recipeLabel?: string;
  /** 
   * Named emotion preset (convenience path).
   * Ignored when `recipe` is provided.
   * Default: 'neutral' (no modifications)
   */
  emotion?: BlobbiEmotion;
  /**
   * Body-level visual effects (dirt marks, stink clouds, etc.).
   * Optional — for manual/external use cases only.
   * Do NOT pass status-reaction body effects here; those are already
   * folded into the recipe and applied by applyVisualRecipe().
   */
  bodyEffects?: BodyEffectsSpec;
  /** Additional CSS classes for the container */
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

// ─── DEBUG: Animation lifecycle instrumentation ──────────────────────────────
const _adultSvgRebuildCount = { current: 0 };
const _adultSafeSvgCount = { current: 0 };
const _adultRenderCount = { current: 0 };
const _adultPrevProps = { current: null as Record<string, unknown> | null };
// ──────────────────────────────────────────────────────────────────────────────

export function BlobbiAdultVisual({ blobbi, reaction = 'idle', lookMode = 'follow-pointer', disableBlink = false, externalEyeOffset, externalEyeOffsetRef, recipe: recipeProp, recipeLabel, emotion = 'neutral', bodyEffects, className }: BlobbiAdultVisualProps) {
  const isSleeping = isBlobbiSleeping(blobbi);
  const containerRef = useRef<HTMLDivElement>(null);

  // ─── DEBUG: Track renders and prop changes ───────────────────────────────
  _adultRenderCount.current++;
  const isCompanion = !!(externalEyeOffset || externalEyeOffsetRef);
  if (isCompanion) {
    const currentProps: Record<string, unknown> = {
      blobbiId: blobbi.id,
      blobbiRef: blobbi,
      isSleeping,
      recipeProp,
      recipeLabel,
      emotion,
      bodyEffects,
    };
    const prev = _adultPrevProps.current;
    if (prev) {
      const changed: string[] = [];
      for (const key of Object.keys(currentProps)) {
        if (currentProps[key] !== prev[key]) {
          changed.push(key);
        }
      }
      if (changed.length > 0) {
        console.log(`%c[AdultVisual] COMPANION render #${_adultRenderCount.current} — props changed: ${changed.join(', ')}`, 'color: #f59e0b; font-weight: bold');
        for (const key of changed) {
          console.log(`  ${key}: `, prev[key], ' → ', currentProps[key]);
        }
      }
    }
    _adultPrevProps.current = currentProps;
  }
  // ─────────────────────────────────────────────────────────────────────────

  // Reaction controls CSS sway/bounce classes. Suppressed when sleeping.
  // NOTE: In companion mode, these classes are applied on an OUTER wrapper
  // (BlobbiCompanionVisual) rather than on this component, so this component
  // can remain a pure SVG renderer that doesn't rerender for walking changes.
  const effectiveReaction = isSleeping ? 'idle' : reaction;

  useBlobbiEyes(containerRef, {
    isSleeping,
    maxMovement: 2.5,
    lookMode,
    disableBlink,
    disableTracking: isCompanion,
  });

  useExternalEyeOffset({
    containerRef,
    externalEyeOffset,
    externalEyeOffsetRef,
    isSleeping,
    variant: 'adult',
  });

  const customizedSvg = useMemo(() => {
    // ─── DEBUG: Track SVG rebuilds ──────────────────────────────────────
    if (isCompanion) {
      _adultSvgRebuildCount.current++;
      console.log(`%c[AdultVisual] COMPANION customizedSvg rebuild #${_adultSvgRebuildCount.current}`, 'color: #ef4444; font-weight: bold');
      console.trace('[AdultVisual] SVG rebuild stack trace');
    }
    // ────────────────────────────────────────────────────────────────────

    const { form, svg } = resolveAdultSvgWithForm(blobbi, { isSleeping });
    const colorizedSvg = customizeAdultSvgFromBlobbi(svg, form, blobbi, isSleeping);

    if (!isSleeping) {
      let animatedSvg = addEyeAnimation(colorizedSvg, { baseColor: blobbi.baseColor, instanceId: blobbi.id });

      // Recipe-first path: use pre-resolved recipe if provided.
      // applyVisualRecipe() handles everything including body effects
      // embedded in the recipe, so no separate applyBodyEffects() needed.
      if (recipeProp) {
        animatedSvg = applyVisualRecipe(animatedSvg, recipeProp, recipeLabel ?? 'status', 'adult', form, blobbi.id);
      } else if (emotion !== 'neutral') {
        // Convenience path: resolve named emotion preset
        const resolved = resolveVisualRecipe(emotion);
        animatedSvg = applyVisualRecipe(animatedSvg, resolved, emotion, 'adult', form, blobbi.id);
      }

      // Manual body effects prop — only applied when no recipe was provided,
      // since applyVisualRecipe() already applies recipe.bodyEffects.
      if (bodyEffects && !recipeProp) {
        animatedSvg = applyBodyEffects(animatedSvg, { ...bodyEffects, idPrefix: bodyEffects.idPrefix ?? blobbi.id });
      }

      return animatedSvg;
    }

    return colorizedSvg;
  }, [blobbi, isSleeping, recipeProp, recipeLabel, emotion, bodyEffects]);

  const safeSvg = useMemo(() => {
    // ─── DEBUG: Track sanitization rebuilds ──────────────────────────────
    if (isCompanion) {
      _adultSafeSvgCount.current++;
      console.log(`%c[AdultVisual] COMPANION safeSvg rebuild #${_adultSafeSvgCount.current}`, 'color: #ef4444');
    }
    // ────────────────────────────────────────────────────────────────────
    return sanitizeBlobbiSvg(customizedSvg);
  }, [customizedSvg]);

  // ─── DEBUG: Track DOM node identity (detect remounts vs rerenders) ──────
  const prevSvgNodeRef = useRef<Element | null>(null);
  useEffect(() => {
    if (!isCompanion || !containerRef.current) return;
    const svgNode = containerRef.current.querySelector('svg');
    if (svgNode && svgNode !== prevSvgNodeRef.current) {
      if (prevSvgNodeRef.current === null) {
        console.log('%c[AdultVisual] COMPANION: SVG node mounted (first time)', 'color: #22c55e');
      } else {
        console.log('%c[AdultVisual] COMPANION: SVG DOM NODE REPLACED! (animations killed)', 'color: #ef4444; font-weight: bold; font-size: 14px');
      }
      prevSvgNodeRef.current = svgNode;
      // Check for SMIL animations
      const animates = svgNode.querySelectorAll('animate, animateTransform');
      console.log(`  SVG has ${animates.length} SMIL animation elements`);
    }
  });
  // ─────────────────────────────────────────────────────────────────────────

  // In companion mode, reaction CSS classes are applied by the outer wrapper
  // (BlobbiCompanionVisual) so this div stays className-stable and
  // dangerouslySetInnerHTML doesn't cause the browser to replace the SVG node.
  const applyReactionClasses = !isCompanion;

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative flex items-center justify-center',
        isSleeping && 'opacity-70',
        applyReactionClasses && (effectiveReaction === 'listening' ||
          effectiveReaction === 'swaying' ||
          effectiveReaction === 'happy') &&
          'animate-blobbi-sway',
        applyReactionClasses && effectiveReaction === 'singing' && 'animate-blobbi-bounce',
        className
      )}
      dangerouslySetInnerHTML={{ __html: safeSvg }}
    />
  );
}
