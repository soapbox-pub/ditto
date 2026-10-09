/**
 * BlobbiV3Visual — a Blobbi drawn by the kit: a V3 (procedural) Blobbi at any
 * stage, and a V2 adult (see lib/kit-drawn.ts for which is which).
 *
 * Every V3 drawing (egg, baby, adult; body, anatomy, face, pattern, mark,
 * views, stage morphology) is `@blobbi-kit/renderer`'s, from the identity the
 * event states; so is the V2 artwork, from the colours and traits the event
 * states. Ditto keeps what is Ditto's: which state to show and when.
 * Its recipes become the kit's expression parts (v3-expression.ts), sleeping
 * is the kit's `isSleeping`, pointer and companion gaze are the kit's
 * `eyeOffset`. Nothing here edits the SVG; the only thing done to it is
 * Ditto's sanitizer, handed to the renderer to run on the finished markup
 * before it reaches the DOM.
 *
 * V1 Blobbis never come here: they keep the V1 pipeline (BlobbiStageVisual).
 */

import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  BlobbiRenderer,
  type BlobbiEggCrack,
  type BlobbiFacing,
  type BlobbiMotion,
} from '@blobbi-kit/renderer';
import type { BlobbiVisualIdentity } from '@blobbi-kit/core';

import { cn } from '@/lib/utils';
import { sanitizeBlobbiSvg } from '@/lib/sanitizeBlobbiSvg';

import { resolveV3Expression } from './lib/v3-expression';
import type { BlobbiEmotion } from './lib/emotion-types';
import type { BlobbiVisualRecipe } from './lib/recipe';
import type { BlobbiLookMode, BlobbiReactionState, ExternalEyeOffset } from './lib/types';

export interface BlobbiV3VisualProps {
  /** The Blobbi's visual identity, from core's `getBlobbiVisualIdentity`. */
  visual: BlobbiVisualIdentity;
  /** Namespaces the drawing's SVG ids; the Blobbi's `d`. */
  instanceId: string;
  isSleeping?: boolean;
  /** Pre-resolved visual recipe. Takes precedence over `emotion`. */
  recipe?: BlobbiVisualRecipe;
  /** Named emotion preset. Ignored when `recipe` is provided. */
  emotion?: BlobbiEmotion;
  reaction?: BlobbiReactionState;
  /** 'follow-pointer' looks at the pointer; 'forward' looks ahead (or where it's told). */
  lookMode?: BlobbiLookMode;
  externalEyeOffset?: ExternalEyeOffset;
  externalEyeOffsetRef?: RefObject<ExternalEyeOffset>;
  /** Companion mode: reaction classes belong to the companion's own wrapper. */
  renderMode?: 'page' | 'companion';
  facing?: BlobbiFacing;
  motion?: BlobbiMotion;
  eggCrack?: BlobbiEggCrack;
  className?: string;
}

/** The kit's sanitizer hook must be a stable reference (it is a memo input). */
const sanitize = sanitizeBlobbiSvg;

/** Gaze steps smaller than this aren't worth a render. */
const GAZE_STEP = 0.02;

const quantize = (value: number) => Math.round(value / GAZE_STEP) * GAZE_STEP;

/**
 * Where the eyes look, as the kit's normalized offset (each axis -1..1).
 * One animation frame loop reads the pointer or the companion's gaze ref and
 * re-renders only when the quantized direction changes; the renderer moves
 * the pupils with CSS variables and never rebuilds the drawing for it.
 */
function useV3Gaze(
  containerRef: RefObject<HTMLDivElement | null>,
  lookMode: BlobbiLookMode,
  externalEyeOffset: ExternalEyeOffset | undefined,
  externalEyeOffsetRef: RefObject<ExternalEyeOffset> | undefined,
  disabled: boolean,
): ExternalEyeOffset {
  const [gaze, setGaze] = useState<ExternalEyeOffset>({ x: 0, y: 0 });
  const followPointer = lookMode === 'follow-pointer' && !externalEyeOffsetRef && !externalEyeOffset;

  useEffect(() => {
    if (disabled || (!followPointer && !externalEyeOffsetRef)) return;

    let pointer: { x: number; y: number } | null = null;
    const onPointerMove = (e: PointerEvent) => { pointer = { x: e.clientX, y: e.clientY }; };
    if (followPointer) window.addEventListener('pointermove', onPointerMove, { passive: true });

    let frame = 0;
    let last = { x: 0, y: 0 };
    const tick = () => {
      let next = last;
      if (externalEyeOffsetRef?.current) {
        next = externalEyeOffsetRef.current;
      } else if (followPointer && pointer && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const angle = Math.atan2(pointer.y - (rect.top + rect.height / 2), pointer.x - (rect.left + rect.width / 2));
        next = { x: Math.cos(angle), y: Math.sin(angle) };
      }
      const q = { x: quantize(next.x), y: quantize(next.y) };
      if (q.x !== last.x || q.y !== last.y) {
        last = q;
        setGaze(q);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      if (followPointer) window.removeEventListener('pointermove', onPointerMove);
    };
  }, [containerRef, followPointer, externalEyeOffsetRef, disabled]);

  if (disabled) return { x: 0, y: 0 };
  return externalEyeOffset ?? gaze;
}

export function BlobbiV3Visual({
  visual,
  instanceId,
  isSleeping = false,
  recipe,
  emotion = 'neutral',
  reaction = 'idle',
  lookMode = 'follow-pointer',
  externalEyeOffset,
  externalEyeOffsetRef,
  renderMode = 'page',
  facing = 'front',
  motion = 'idle',
  eggCrack,
  className,
}: BlobbiV3VisualProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isEgg = visual.stage === 'egg';
  const eyeOffset = useV3Gaze(containerRef, lookMode, externalEyeOffset, externalEyeOffsetRef, isSleeping || isEgg);
  const expression = resolveV3Expression(recipe, emotion);

  const effectiveReaction = isSleeping ? 'idle' : reaction;
  const isCompanion = renderMode === 'companion';

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative flex items-center justify-center',
        !isCompanion && (effectiveReaction === 'listening' ||
          effectiveReaction === 'swaying' ||
          effectiveReaction === 'happy') &&
          'animate-blobbi-sway',
        !isCompanion && effectiveReaction === 'singing' && 'animate-blobbi-bounce',
        className,
      )}
      data-blobbi-kit={visual.visualGeneration}
      data-blobbi-v3={visual.visualGeneration === 'v3' ? '' : undefined}
    >
      <BlobbiRenderer
        // Core's identity is shaped to be the renderer's visual, as the kit documents.
        visual={visual}
        instanceId={instanceId}
        size="100%"
        isSleeping={isSleeping}
        facing={facing}
        eyeOffset={isEgg ? undefined : eyeOffset}
        expression={expression}
        motion={motion}
        eggCrack={isEgg ? eggCrack : undefined}
        sanitize={sanitize}
      />
    </div>
  );
}
