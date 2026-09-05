/**
 * The canonical body boundary: Ditto's visual pipeline starts from
 * `@blobbi/renderer` output for every stage, form, colour and generation.
 */
import { describe, it, expect } from 'vitest';
import { ADULT_FORMS, deriveAdultFormFromSeed } from '@blobbi-kit/core/types/adult';
import { renderCanonicalBaseSvg, resolveRenderGeneration, type RenderableBlobbi } from './canonical-base';
import { addEyeAnimation } from './eye-animation';
import { detectEyePositions } from './eyes/detection';

const STATS = { hunger: 80, happiness: 80, health: 80, hygiene: 80, energy: 80 };
function blobbi(over: Partial<RenderableBlobbi> = {}): RenderableBlobbi {
  return {
    id: 'blobbi-aaaaaaaaaaaa-0123456789',
    name: 'Probe',
    lifeStage: 'adult',
    state: 'active',
    stats: STATS,
    baseColor: '#33AA66',
    secondaryColor: '#FFCC00',
    eyeColor: '#12ABEF',
    pattern: 'solid',
    specialMark: 'none',
    size: 'medium',
    seed: 'ab'.repeat(32),
    tags: [],
    ...over,
  };
}
const adult = (form: string, over: Partial<RenderableBlobbi> = {}) => blobbi({ adult: { evolutionForm: form }, ...over });
/** Pupils after the fix: gradient stops or flat fills carrying the eye colour. */
const eyeColorPresent = (svg: string, eye: string) => new RegExp(`stop-color:${eye}|fill="${eye}" data-blobbi-pupil="true"`, 'i').test(svg);

describe('Adult V1 through the canonical renderer', () => {
  it.each(ADULT_FORMS)('%s draws its own form with the requested colours and per-instance ids', (form) => {
    const { svg, form: drawn, generation, view } = renderCanonicalBaseSvg(adult(form), { stage: 'adult', instanceId: 'inst' });
    expect(drawn).toBe(form);
    expect(generation).toBe('v1');
    expect(view).toBe('front');
    expect(svg).toMatch(/^(<\?xml[^>]*\?>\s*)?<svg\b/);
    // The body colour changed the drawing (some forms only use lightened or
    // darkened derivatives of it) and every id is namespaced for this instance.
    const uncoloured = renderCanonicalBaseSvg(adult(form, { baseColor: '', secondaryColor: '', eyeColor: '' }), { stage: 'adult', instanceId: 'inst' }).svg;
    expect(svg).not.toBe(uncoloured);
    for (const id of [...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1])) expect(id.startsWith('b_inst_')).toBe(true);
    // Ditto's eye system can still find both eyes on the canonical drawing.
    expect(detectEyePositions(addEyeAnimation(svg, { baseColor: '#33AA66', instanceId: 'inst' }))).toHaveLength(2);
  });

  it.each(ADULT_FORMS)('%s honours eyeColor (the historical 12-form regression is gone)', (form) => {
    const { svg } = renderCanonicalBaseSvg(adult(form, { eyeColor: '#12ABEF' }), { stage: 'adult', instanceId: 'e' });
    expect(eyeColorPresent(svg, '#12abef'), `${form} must carry the eye colour`).toBe(true);
    const plain = renderCanonicalBaseSvg(adult(form, { eyeColor: '' }), { stage: 'adult', instanceId: 'e' }).svg;
    expect(eyeColorPresent(plain, '#12abef')).toBe(false);
  });

  it('resolves the form the way Ditto always did: explicit form, else seed, else default', () => {
    const seed = 'ab'.repeat(32);
    expect(renderCanonicalBaseSvg(blobbi({ seed, adult: undefined }), { stage: 'adult', instanceId: 'x' }).form).toBe(deriveAdultFormFromSeed(seed));
    expect(renderCanonicalBaseSvg(blobbi({ seed: undefined, adult: undefined }), { stage: 'adult', instanceId: 'x' }).form).toBe('catti');
    expect(renderCanonicalBaseSvg(adult('froggi'), { stage: 'adult', instanceId: 'x' }).form).toBe('froggi');
    expect(renderCanonicalBaseSvg(adult('wormhole', { seed }), { stage: 'adult', instanceId: 'x' }).form).toBe(deriveAdultFormFromSeed(seed));
  });

  it('secondaryColor reaches the two-tone gradient; empty colours are treated as absent', () => {
    const two = renderCanonicalBaseSvg(adult('catti', { secondaryColor: '#FFCC00' }), { stage: 'adult', instanceId: 'x' }).svg;
    expect(two.toLowerCase()).toContain('#ffcc00');
    const none = renderCanonicalBaseSvg(adult('catti', { baseColor: '', secondaryColor: '', eyeColor: '' }), { stage: 'adult', instanceId: 'x' }).svg;
    expect(none).not.toContain('stop-color:;');
    expect(none.toLowerCase()).not.toContain('#33aa66');
    expect(none.toLowerCase()).not.toContain('#ffcc00');
  });

  it('is deterministic and never asks for the sleeping artwork or renderer gaze', () => {
    const a = renderCanonicalBaseSvg(adult('owli'), { stage: 'adult', instanceId: 'd' }).svg;
    const b = renderCanonicalBaseSvg(adult('owli'), { stage: 'adult', instanceId: 'd' }).svg;
    expect(a).toBe(b);
    expect(a).not.toContain('blobbi-pupil');
    expect(a).not.toContain('data-blobbi-gaze-style');
    // Awake drawing: both pupils are present for Ditto's blink overlay to close.
    expect(detectEyePositions(a)).toHaveLength(2);
  });
});

describe('Baby V1 through the canonical renderer', () => {
  it('draws the baby with its colours, ids and detectable eyes', () => {
    const { svg, form, generation } = renderCanonicalBaseSvg(blobbi({ lifeStage: 'baby', adult: undefined }), { stage: 'baby', instanceId: 'baby' });
    expect(form).toBeUndefined();
    expect(generation).toBe('v1');
    expect(svg).toContain('viewBox="0 0 100 100"');
    expect(svg).toContain('id="b_baby_blobbiBodyGradient"');
    expect(svg.toLowerCase()).toContain('#33aa66');
    expect(svg.toLowerCase()).toContain('#12abef');
    expect(detectEyePositions(addEyeAnimation(svg, { baseColor: '#33AA66', instanceId: 'baby' }))).toHaveLength(2);
  });
});

describe('visual generation is identity, defaulting to V1', () => {
  it('absent, v1 and garbage resolve to v1; only v2 resolves to v2', () => {
    expect(resolveRenderGeneration({})).toBe('v1');
    expect(resolveRenderGeneration({ visualGeneration: 'v1' })).toBe('v1');
    expect(resolveRenderGeneration({ visualGeneration: 'v9' as never })).toBe('v1');
    expect(resolveRenderGeneration({ visualGeneration: 'v2' })).toBe('v2');
  });

  it('a Blobbi without the field draws exactly the V1 body it drew before', () => {
    const withField = renderCanonicalBaseSvg(adult('pandi', { visualGeneration: 'v1' }), { stage: 'adult', instanceId: 'g' }).svg;
    const without = renderCanonicalBaseSvg(adult('pandi'), { stage: 'adult', instanceId: 'g' }).svg;
    expect(without).toBe(withField);
    expect(without).not.toContain('data-blobbi-generation="v2"');
  });

  it.each(['front', 'right', 'left', 'back'] as const)('a synthetic Adult V2 passes through the boundary facing %s', (facing) => {
    const { svg, generation, view, mirrored, form } = renderCanonicalBaseSvg(adult('catti', { visualGeneration: 'v2' }), { stage: 'adult', instanceId: 'v2', facing });
    expect(generation).toBe('v2');
    expect(svg).toContain('data-blobbi-generation="v2"');
    expect(svg).toContain('data-part="body-base"');
    expect(svg.toLowerCase()).toContain('#33aa66');
    expect(view).toBe(facing === 'back' ? 'back' : facing === 'front' ? 'front' : 'side');
    expect(mirrored).toBe(facing === 'left');
    expect(form).toBe('catti'); // carried for the host, ignored by V2's single anatomy
    // Ditto's V1-shaped eye transforms find nothing to wrap and leave the drawing alone.
    expect(addEyeAnimation(svg, { baseColor: '#33AA66', instanceId: 'v2' })).toBe(svg);
  });

  it('a V2 baby draws the V1 baby, as the renderer documents', () => {
    const { svg, generation } = renderCanonicalBaseSvg(blobbi({ lifeStage: 'baby', visualGeneration: 'v2', adult: undefined }), { stage: 'baby', instanceId: 'vb' });
    expect(generation).toBe('v1');
    expect(svg).toContain('blobbiBodyGradient');
  });
});
