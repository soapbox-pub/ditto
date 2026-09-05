/**
 * Canonical base artwork for Ditto's Blobbi visuals.
 *
 * The BODY comes from `@blobbi/renderer`, the canonical Blobbi renderer shared
 * with Blobbi Island: anatomy, V1 form artwork, trait colours, sleeping
 * artwork, per-instance SVG ids and, for V2, the authored directional views.
 * Ditto no longer keeps its own copy of that engine.
 *
 * Everything Ditto layers ON TOP of the body stays in Ditto and runs on the
 * string this module returns, exactly as it ran on the old local generator:
 *
 *   renderCanonicalBaseSvg()            ← this module (canonical body)
 *     ↓ addEyeAnimation()               ← Ditto: blink clip-paths, gaze groups
 *     ↓ applyVisualRecipe()             ← Ditto: emotions, status reactions
 *     ↓ applyBodyEffects()              ← Ditto: dirt, stink, anger rise
 *     ↓ sanitizeBlobbiSvg()             ← Ditto: output-boundary sanitizer
 *     ↓ dangerouslySetInnerHTML         ← Ditto: presentation
 *
 * Deliberate choices, each preserving Ditto's current visible behaviour:
 *  - the AWAKE drawing is always requested (`eyesClosed: false`): in Ditto,
 *    sleeping is a recipe overlay (closed-eye lines + Zzz) driven by
 *    `useBlobbiEyes`, not an artwork swap;
 *  - the renderer's own gaze markup is OFF (`gaze: false`): Ditto's
 *    `useBlobbiEyes` / `useExternalEyeOffset` own eye tracking and blinking,
 *    so there is exactly one eye transform and one RAF loop per visual;
 *  - the adult FORM is resolved by the domain kit (`resolveAdultForm`:
 *    explicit evolution form, else seed-derived, else the default), the same
 *    rule Ditto always used, so a Blobbi without an explicit form keeps the
 *    body its seed gave it instead of the renderer's default form;
 *  - the artwork GENERATION is identity: `visualGeneration` from the parsed
 *    companion, `'v1'` when absent, exactly as `@blobbi-kit/core` reads it.
 */
import { renderBlobbiSvg, type BlobbiFacing, type BlobbiVisualGeneration } from '@blobbi/renderer';
import type { Blobbi } from '@blobbi-kit/core/types/blobbi';
import { resolveAdultForm, type AdultForm } from '@blobbi-kit/core/types/adult';

/**
 * The visual-side Blobbi Ditto's components receive: the domain `Blobbi` plus
 * the artwork generation the domain resolved for it (absent means V1).
 */
export interface RenderableBlobbi extends Blobbi {
  visualGeneration?: BlobbiVisualGeneration;
}

export interface CanonicalBaseOptions {
  /** Which body to draw. Eggs never come here (see BlobbiEggVisual). */
  stage: 'baby' | 'adult';
  /** SVG id namespace for this mounted instance. */
  instanceId: string;
  /**
   * Which way the body is turned. V1 draws its front for the profiles and a
   * derived rear for `'back'`; V2 has authored views. Ditto currently only
   * draws the front; the option exists so the V2 views pass through this
   * boundary unchanged.
   */
  facing?: BlobbiFacing;
}

export interface CanonicalBaseResult {
  /** The finished body markup, ids namespaced, colours applied. */
  svg: string;
  /** The V1 form that was drawn (undefined for the baby). */
  form?: AdultForm;
  /** The artwork generation actually drawn. */
  generation: BlobbiVisualGeneration;
  /** The authored view that was drawn and whether it was mirrored (V2 left). */
  view: 'front' | 'side' | 'back';
  mirrored: boolean;
}

/** The generation a visual-side Blobbi draws with: identity, defaulting to V1. */
export function resolveRenderGeneration(blobbi: Pick<RenderableBlobbi, 'visualGeneration'>): BlobbiVisualGeneration {
  return blobbi.visualGeneration === 'v2' ? 'v2' : 'v1';
}

/**
 * Draw the canonical body for a Blobbi. Pure and deterministic: the same
 * Blobbi and options always yield the same string.
 */
export function renderCanonicalBaseSvg(blobbi: RenderableBlobbi, options: CanonicalBaseOptions): CanonicalBaseResult {
  const { stage, instanceId, facing = 'front' } = options;
  const form = stage === 'adult' ? resolveAdultForm(blobbi) : undefined;
  const { svg, artwork } = renderBlobbiSvg({
    stage,
    visualGeneration: resolveRenderGeneration(blobbi),
    adultType: form,
    // An empty string is "no colour", exactly as the customizers always read
    // an absent one; never let '' reach a gradient stop.
    baseColor: blobbi.baseColor || undefined,
    secondaryColor: blobbi.secondaryColor || undefined,
    eyeColor: blobbi.eyeColor || undefined,
    facing,
    eyesClosed: false,
    instanceId,
    gaze: false,
  });
  return { svg, form, generation: artwork.generation, view: artwork.view, mirrored: artwork.mirrored };
}
