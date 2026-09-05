/**
 * Regression: mouth detection and replacement must not depend on SVG comments.
 *
 * History. Ditto's inlined V1 artwork was minified on 2026-07-05 (commit
 * e2a487d2), stripping the `<!-- Mouth -->` marker. From then until the
 * canonical-renderer migration, every mouth-changing recipe on Catti replaced
 * only the LEFT half of its two-path mouth (centre x=91 instead of 100) and
 * the marker-less global replacement deleted every other single-Q stroke
 * path: Catti's four whiskers and six of Froggi's feature strokes. The
 * canonical artwork carries the marker again, which restored the intended
 * output; this file pins that the intended output no longer needs the marker.
 *
 * Fails at Ditto 9dde182d (the `without comments` expectations).
 */
import { describe, it, expect } from 'vitest';
import { ADULT_FORMS } from '@blobbi-kit/core/types/adult';
import { renderCanonicalBaseSvg, type RenderableBlobbi } from '../canonical-base';
import { addEyeAnimation } from '../eye-animation';
import { applyVisualRecipe, resolveVisualRecipe, EMOTION_RECIPES } from '../recipe';
import { detectMouthPosition, replaceMouthSection } from './detection';

const stripComments = (s: string) => s.replace(/<!--[\s\S]*?-->/g, '');
const EYE = '#12abef';
function blobbi(form: string): RenderableBlobbi {
  return {
    id: 'blobbi-dddddddddddd-0123456789', name: 'Probe', lifeStage: 'adult', state: 'active',
    stats: { hunger: 80, happiness: 80, health: 80, hygiene: 80, energy: 80 },
    baseColor: '#33AA66', secondaryColor: '#FFCC00', eyeColor: EYE, pattern: 'solid', specialMark: 'none', size: 'medium',
    seed: 'ab'.repeat(32), tags: [], adult: { evolutionForm: form },
  };
}
const body = (form: string) => renderCanonicalBaseSvg(blobbi(form), { stage: 'adult', instanceId: 'm' }).svg;
const prepared = (form: string, svg = body(form)) => addEyeAnimation(svg, { baseColor: '#33AA66', instanceId: 'm' });
const MOUTH_RECIPES = Object.entries(EMOTION_RECIPES).filter(([, r]) => r.mouth).map(([name]) => name);
const NON_MOUTH_RECIPES = Object.entries(EMOTION_RECIPES).filter(([, r]) => !r.mouth).map(([name]) => name);
const mouthEl = (svg: string): string[] => Array.from(svg.match(/<(?:path|ellipse)[^>]*class="[^"]*blobbi-mouth[^"]*"[^>]*>/g) ?? []);
const whiskers = (svg: string) => (svg.match(/M 48 108|M 48 118|M 128 108|M 128 118/g) ?? []).length;
const CATTI_MOUTH_HALVES = [/M 100 122 Q 88 128 82 122/, /M 100 122 Q 112 128 118 122/];

describe('catti: the two-path mouth is one mouth, with or without comments', () => {
  it('the neutral canonical catti carries both halves stroked with the mouth gradient and four whiskers', () => {
    const svg = body('catti');
    for (const half of CATTI_MOUTH_HALVES) expect(svg).toMatch(half);
    expect(svg.match(/stroke="url\(#b_m_cattiMouth3D\)"/g)).toHaveLength(2);
    expect(whiskers(svg)).toBe(4);
  });

  it('detection spans both halves (x 82..118, centre 100) whether or not the marker is present', () => {
    const expected = { startX: 82, startY: 122, controlX: 100, controlY: 128, endX: 118, endY: 122 };
    const withMarker = detectMouthPosition(prepared('catti'))!.position;
    const withoutMarker = detectMouthPosition(prepared('catti', stripComments(body('catti'))))!.position;
    expect(withMarker).toMatchObject(expected);
    expect(withoutMarker).toMatchObject(expected);
    // The minification-era result: the left half alone, read backwards.
    expect(withoutMarker).not.toMatchObject({ startX: 100, endX: 82 });
  });

  it.each(MOUTH_RECIPES)('%s: one centred mouth, whiskers kept, eyeColor kept, identical without comments', (emotion) => {
    expect(MOUTH_RECIPES.length).toBeGreaterThanOrEqual(12);
    const recipe = resolveVisualRecipe(emotion as never);
    const withC = applyVisualRecipe(prepared('catti'), recipe, emotion, 'adult', 'catti', 'm');
    const noC = applyVisualRecipe(prepared('catti', stripComments(body('catti'))), recipe, emotion, 'adult', 'catti', 'm');
    // Exactly one recipe mouth, centred on the face.
    const mouths = mouthEl(withC);
    expect(mouths).toHaveLength(1);
    const mouth = mouths[0] ?? '';
    const centre = mouth.match(/\bcx="([\d.]+)"/)?.[1] ?? centreOfQ(mouth);
    expect(Number(centre)).toBeCloseTo(100, 5);
    // Both original halves are gone; nothing else was touched.
    for (const half of CATTI_MOUTH_HALVES) expect(withC).not.toMatch(half);
    expect(whiskers(withC)).toBe(4);
    // The historical minified geometry never comes back.
    expect(withC).not.toContain('d="M 100 125 Q 88 119 82 125"');
    expect(withC).not.toMatch(/blobbi-mouth[^>]*cx="91"/);
    // eyeColor fix retained through the recipe.
    expect(withC.toLowerCase()).toContain(EYE);
    // Comment-independence: same output once comments are ignored.
    expect(stripComments(withC)).toBe(stripComments(noC));
  });

  it.each(NON_MOUTH_RECIPES)('%s: recipes without a mouth part leave both halves untouched', (emotion) => {
    const recipe = resolveVisualRecipe(emotion as never);
    const out = applyVisualRecipe(prepared('catti'), recipe, emotion, 'adult', 'catti', 'm');
    for (const half of CATTI_MOUTH_HALVES) expect(out).toMatch(half);
    expect(mouthEl(out)).toHaveLength(0);
    expect(whiskers(out)).toBe(4);
  });

  it('a stray Q-curve path elsewhere is never mistaken for the mouth', () => {
    const svg = body('catti').replace('</svg>', '<path d="M 10 150 Q 20 160 30 150" stroke="#1f2937" stroke-width="2" fill="none" /></svg>');
    const out = replaceMouthSection(stripComments(svg), '<path class="blobbi-mouth blobbi-mouth-test" d="M 0 0 Q 1 1 2 2" stroke="#000" />');
    expect(out).toContain('M 10 150 Q 20 160 30 150');
    expect(out).toContain('blobbi-mouth-test');
    for (const half of CATTI_MOUTH_HALVES) expect(out).not.toMatch(half);
  });
});

describe('every V1 form detects the same mouth with and without comments', () => {
  it.each(ADULT_FORMS)('%s', (form) => {
    const svg = body(form);
    const a = detectMouthPosition(prepared(form, svg));
    const b = detectMouthPosition(prepared(form, stripComments(svg)));
    expect(b).toEqual(a && { ...a, mouthElements: b?.mouthElements, startIndex: b?.startIndex, endIndex: b?.endIndex });
    if (form === 'owli') expect(a).toBeNull();
    else expect(a).not.toBeNull();
  });

  it.each(['sad', 'surprised', 'sleepy', 'eating'] as const)('%s: recipe output is comment-independent on all 16 forms', (emotion) => {
    const recipe = resolveVisualRecipe(emotion);
    for (const form of ADULT_FORMS) {
      const svg = body(form);
      const a = applyVisualRecipe(prepared(form, svg), recipe, emotion, 'adult', form, 'm');
      const b = applyVisualRecipe(prepared(form, stripComments(svg)), recipe, emotion, 'adult', form, 'm');
      expect(stripComments(a), form).toBe(stripComments(b));
    }
  });
});

function centreOfQ(pathTag: string): number {
  const m = pathTag.match(/d="M\s*([\d.]+)\s+[\d.]+\s*Q\s*[\d.]+\s+[\d.]+\s+([\d.]+)/);
  return m ? (Number(m[1]) + Number(m[2])) / 2 : NaN;
}
