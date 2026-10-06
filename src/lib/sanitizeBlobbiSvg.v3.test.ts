import { describe, expect, it } from 'vitest';
import { renderBlobbiSvg, type BlobbiExpression, type BlobbiFacing, type BlobbiMotion } from '@blobbi-kit/renderer';

import { V3_REFERENCE_BLOBBIS } from '@/blobbi/dev/v3-reference';

import { sanitizeBlobbiSvg } from './sanitizeBlobbiSvg';

/**
 * The kit's V3 drawings pass Ditto's Blobbi sanitizer untouched, and the
 * allowance made for them (a Gaussian blur filter) lets nothing else in.
 */

/** Markup as the browser holds it: what the sanitizer returns is compared after the same parse. */
function asDom(svg: string): string {
  const host = document.createElement('div');
  host.innerHTML = svg;
  return host.innerHTML;
}

const STAGES = ['egg', 'baby', 'adult'] as const;
const FACINGS: BlobbiFacing[] = ['front', 'right', 'left', 'back'];

describe('sanitizeBlobbiSvg and the kit V3 drawings', () => {
  it('keeps every reference Blobbi intact, at every stage and from every side', () => {
    for (const { name, identity } of V3_REFERENCE_BLOBBIS) {
      for (const stage of STAGES) {
        for (const facing of FACINGS) {
          const { svg } = renderBlobbiSvg({ stage, visualGeneration: 'v3', v3: identity, facing, instanceId: `blobbi-${name}`, gaze: { x: 0.4, y: -0.2 }, eggCrack: stage === 'egg' ? 'heavy' : undefined });
          expect(sanitizeBlobbiSvg(svg), `${name} ${stage} ${facing}`).toBe(asDom(svg));
        }
      }
    }
  });

  it('keeps expressions, sleep and the rig motion stylesheet intact', () => {
    const expressions: BlobbiExpression[] = ['neutral', 'happy', 'excited', 'sad', 'sleepy', 'surprised', 'upset', { blend: { happy: 0.6, sad: 0.2 } }, { eyes: 'half', mouth: 'frown', brows: 'inner-up', blush: 'none' }];
    const motions: BlobbiMotion[] = ['still', 'idle', 'walking'];
    const { identity } = V3_REFERENCE_BLOBBIS.find((b) => b.name === 'crowded-crown')!;
    for (const stage of STAGES) {
      for (const expression of expressions) {
        for (const motion of motions) {
          for (const eyesClosed of [false, true]) {
            const { svg } = renderBlobbiSvg({ stage, visualGeneration: 'v3', v3: identity, expression, motion, eyesClosed, instanceId: 'b' });
            expect(sanitizeBlobbiSvg(svg), `${stage} ${JSON.stringify(expression)} ${motion} ${eyesClosed}`).toBe(asDom(svg));
          }
        }
      }
    }
  });

  it('the drawings use the blur filter it was widened for, and keep it', () => {
    const { identity } = V3_REFERENCE_BLOBBIS.find((b) => b.name === 'crowded-crown')!;
    const { svg } = renderBlobbiSvg({ stage: 'adult', visualGeneration: 'v3', v3: identity, instanceId: 'b' });
    const clean = sanitizeBlobbiSvg(svg);
    expect(svg).toMatch(/<filter\b/);
    expect(clean).toMatch(/<feGaussianBlur\b[^>]*stdDeviation=/);
    expect(clean).toMatch(/filter="url\(#[\w-]+\)"/);
    expect(clean).toMatch(/<linearGradient|<radialGradient/);
    expect(clean).toMatch(/clip-path="url\(#[\w-]+\)"/);
    expect(clean).toMatch(/transform="/);
  });
});

describe('sanitizeBlobbiSvg still refuses what it refused', () => {
  const wrap = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${inner}</svg>`;

  it('drops a filter reference that is not a fragment of this drawing', () => {
    for (const value of ['url(https://evil.example/f.svg#x)', 'url(#a) url(#b)', 'blur(4px)', 'url(javascript:alert(1))', 'url( #a)']) {
      const clean = sanitizeBlobbiSvg(wrap(`<circle r="1" filter="${value}"/>`));
      expect(clean, value).not.toContain('filter=');
      expect(clean, value).toContain('<circle');
    }
    expect(sanitizeBlobbiSvg(wrap('<circle r="1" filter="url(#b_x-blur1)"/>'))).toContain('filter="url(#b_x-blur1)"');
  });

  it('allows the blur primitive and no other', () => {
    const clean = sanitizeBlobbiSvg(wrap('<filter id="f"><feGaussianBlur stdDeviation="2"/><feImage href="https://evil.example/x.png"/><feTurbulence baseFrequency="0.1"/><feColorMatrix values="0"/></filter>'));
    expect(clean).toContain('<feGaussianBlur stdDeviation="2"');
    expect(clean).not.toMatch(/feImage|feTurbulence|feColorMatrix|evil/);
  });

  it('strips scripts, handlers, links and foreign content', () => {
    const clean = sanitizeBlobbiSvg(wrap(
      '<script>alert(1)</script>'
      + '<circle r="1" onload="alert(1)" onclick="alert(1)"/>'
      + '<a href="https://evil.example"><circle r="2"/></a>'
      + '<use href="https://evil.example/s.svg#x"/>'
      + '<image href="https://evil.example/x.png"/>'
      + '<foreignObject><div>hi</div></foreignObject>'
      + '<linearGradient id="g" href="https://evil.example/g.svg#g"/>'
      + '<filter id="f" onbegin="alert(1)"><feGaussianBlur stdDeviation="1" onload="alert(1)"/></filter>',
    ));
    expect(clean).not.toMatch(/script|alert|onload|onclick|onbegin|evil|foreignObject|<use|<image|<a\b|href=/);
    expect(clean).toContain('<feGaussianBlur stdDeviation="1"');
  });
});
