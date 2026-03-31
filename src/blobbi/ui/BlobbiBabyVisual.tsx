/**
 * BlobbiBabyVisual - Reusable component for rendering Blobbi babies
 *
 * Uses the baby-blobbi module for SVG resolution and customization.
 * Handles awake vs sleeping states automatically.
 * Eyes always track the mouse cursor in real-time.
 *
 * Accepts either:
 *   - `recipe` + `recipeLabel`: a pre-resolved visual recipe (recipe-first path
 *     from useStatusReaction). The recipe includes body effects — no separate
 *     bodyEffects prop is needed for this path.
 *   - `emotion`: a named emotion preset (convenience path, resolved internally)
 *
 * An optional `bodyEffects` prop is available for manual/external use cases
 * outside the status reaction system.
 */

import { useMemo, useRef, useEffect, type RefObject } from 'react';

import { resolveBabySvg, customizeBabySvgFromBlobbi } from '@/blobbi/baby-blobbi';
import { addEyeAnimation } from './lib/eye-animation';
import { resolveVisualRecipe, applyVisualRecipe, type BlobbiVisualRecipe } from './lib/recipe';
import type { BlobbiEmotion } from './lib/emotion-types';
import { applyBodyEffects, type BodyEffectsSpec } from './lib/bodyEffects';
import { useBlobbiEyes, type BlobbiLookMode } from './lib/useBlobbiEyes';
import { useExternalEyeOffset } from './lib/useExternalEyeOffset';
import type { ExternalEyeOffset, BlobbiReactionState } from './lib/types';
import { cn } from '@/lib/utils';
import type { Blobbi } from '@/blobbi/core/types/blobbi';
import { isBlobbiSleeping } from '@/blobbi/core/types/blobbi';
import { sanitizeBlobbiSvg } from '@/lib/sanitizeBlobbiSvg';

// Re-export types for backwards compatibility
export type { ExternalEyeOffset };

/**
 * @deprecated Use BlobbiReactionState from './lib/types' instead
 */
export type BabyReactionState = BlobbiReactionState;

export interface BlobbiBabyVisualProps {
  blobbi: Blobbi;
  reaction?: BabyReactionState;
  lookMode?: BlobbiLookMode;
  disableBlink?: boolean;
  externalEyeOffset?: ExternalEyeOffset;
  /** Ref-based external eye offset (imperative — no rerenders). Preferred for companion mode. */
  externalEyeOffsetRef?: RefObject<ExternalEyeOffset>;
  /** Pre-resolved visual recipe. Takes precedence over `emotion`. */
  recipe?: BlobbiVisualRecipe;
  /** Label for the recipe (CSS class names). Required when `recipe` is provided. */
  recipeLabel?: string;
  /** Named emotion preset (convenience path). Ignored when `recipe` is provided. */
  emotion?: BlobbiEmotion;
  /**
   * Body-level visual effects — for manual/external use only.
   * Status-reaction body effects are already in the recipe.
   */
  bodyEffects?: BodyEffectsSpec;
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

// ─── DEBUG: Animation lifecycle instrumentation ──────────────────────────────
const _babySvgRebuildCount = { current: 0 };
const _babySafeSvgCount = { current: 0 };
const _babyRenderCount = { current: 0 };
const _babyPrevProps = { current: null as Record<string, unknown> | null };
// ──────────────────────────────────────────────────────────────────────────────

export function BlobbiBabyVisual({ blobbi, reaction = 'idle', lookMode = 'follow-pointer', disableBlink = false, externalEyeOffset, externalEyeOffsetRef, recipe: recipeProp, recipeLabel, emotion = 'neutral', bodyEffects, className }: BlobbiBabyVisualProps) {
  const isSleeping = isBlobbiSleeping(blobbi);
  const containerRef = useRef<HTMLDivElement>(null);

  // ─── DEBUG: Track renders and prop changes ───────────────────────────────
  _babyRenderCount.current++;
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
    const prev = _babyPrevProps.current;
    if (prev) {
      const changed: string[] = [];
      for (const key of Object.keys(currentProps)) {
        if (currentProps[key] !== prev[key]) {
          changed.push(key);
        }
      }
      if (changed.length > 0) {
        console.log(`%c[BabyVisual] COMPANION render #${_babyRenderCount.current} — props changed: ${changed.join(', ')}`, 'color: #f59e0b; font-weight: bold');
        for (const key of changed) {
          console.log(`  ${key}: `, prev[key], ' → ', currentProps[key]);
        }
      }
    }
    _babyPrevProps.current = currentProps;
  }
  // ─────────────────────────────────────────────────────────────────────────

  const effectiveReaction = isSleeping ? 'idle' : reaction;

  useBlobbiEyes(containerRef, {
    isSleeping,
    maxMovement: 2,
    lookMode,
    disableBlink,
    disableTracking: isCompanion,
  });

  useExternalEyeOffset({
    containerRef,
    externalEyeOffset,
    externalEyeOffsetRef,
    isSleeping,
    variant: 'baby',
  });

  const customizedSvg = useMemo(() => {
    // ─── DEBUG: Track SVG rebuilds ──────────────────────────────────────
    if (isCompanion) {
      _babySvgRebuildCount.current++;
      console.log(`%c[BabyVisual] COMPANION customizedSvg rebuild #${_babySvgRebuildCount.current}`, 'color: #ef4444; font-weight: bold');
      console.trace('[BabyVisual] SVG rebuild stack trace');
    }
    // ────────────────────────────────────────────────────────────────────

    const baseSvg = resolveBabySvg(blobbi, { isSleeping });
    const colorizedSvg = customizeBabySvgFromBlobbi(baseSvg, blobbi, isSleeping);

    if (!isSleeping) {
      let animatedSvg = addEyeAnimation(colorizedSvg, { baseColor: blobbi.baseColor, instanceId: blobbi.id });

      // Recipe-first path: applyVisualRecipe() handles body effects in the recipe.
      if (recipeProp) {
        animatedSvg = applyVisualRecipe(animatedSvg, recipeProp, recipeLabel ?? 'status', 'baby', undefined, blobbi.id);
      } else if (emotion !== 'neutral') {
        const resolved = resolveVisualRecipe(emotion);
        animatedSvg = applyVisualRecipe(animatedSvg, resolved, emotion, 'baby', undefined, blobbi.id);
      }

      // Manual body effects prop — only when no recipe was provided.
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
      _babySafeSvgCount.current++;
      console.log(`%c[BabyVisual] COMPANION safeSvg rebuild #${_babySafeSvgCount.current}`, 'color: #ef4444');
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
        console.log('%c[BabyVisual] COMPANION: SVG node mounted (first time)', 'color: #22c55e');
      } else {
        console.log('%c[BabyVisual] COMPANION: SVG DOM NODE REPLACED! (animations killed)', 'color: #ef4444; font-weight: bold; font-size: 14px');
      }
      prevSvgNodeRef.current = svgNode;
      const animates = svgNode.querySelectorAll('animate, animateTransform');
      console.log(`  SVG has ${animates.length} SMIL animation elements`);
    }
  });
  // ─────────────────────────────────────────────────────────────────────────

  // In companion mode, reaction CSS classes are applied by the outer wrapper
  // (BlobbiCompanionVisual) so this div stays className-stable.
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
