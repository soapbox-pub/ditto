/**
 * Ditto holds no V3 source of truth. The procedural generation (genome,
 * morphology, geometry, palette, patterns, marks) and the V3 identity rules
 * are blobbi-kit's; Ditto states which Blobbi and which state, and draws
 * whatever the kit returns, without editing it. This test walks `src` and
 * fails on the fingerprints of a local V3 engine or of V3 SVG surgery.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/** Code only: comments may name what is not done here. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

const sources = walk(SRC)
  .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.includes('/test/'))
  .map((f) => ({ path: relative(SRC, f), text: stripComments(readFileSync(f, 'utf8')) }));

/** Blobbi code: the blobbi tree and the Blobbi pages, widgets and previews outside it. */
const blobbiSources = sources.filter((s) => /^blobbi\/|Blobbi|npanel\/blobbi/.test(s.path));
/** The kit's reference identities, copied as fixture data (names like 'tail' are case names). */
const FIXTURE_DATA = 'blobbi/dev/v3-reference.ts';

const read = (path: string) => sources.find((s) => s.path === path)!.text;

describe('no local V3 implementation in Ditto', () => {
  it('has source files to check', () => {
    expect(sources.length).toBeGreaterThan(100);
    expect(blobbiSources.length).toBeGreaterThan(50);
  });

  it('reaches into no kit internals', () => {
    const hits = sources.filter((s) => /@blobbi-kit\/renderer\/|blobbi-kit\/.*\/(procedural|artwork)\b/.test(s.text)).map((s) => s.path);
    expect(hits).toEqual([]);
  });

  it('has no procedural engine of its own', () => {
    const hits = blobbiSources
      .filter((s) => /\bgenome\b|morpholog|mulberry32|splitmix|xoshiro|stagePlan|BLOBBI_V3_ALGORITHM_VERSION/i.test(s.text))
      .map((s) => s.path);
    expect(hits).toEqual([]);
  });

  it('reads and writes no V3 identity tag by hand', () => {
    const hits = sources
      .filter((s) => s.path !== FIXTURE_DATA)
      .filter((s) => /['"](visual_algorithm|accent_color|antenna|horns|ears|tail|belly|freckles)['"]/.test(s.text))
      .map((s) => s.path);
    expect(hits).toEqual([]);
  });

  it('makes no V3 identity: creation stays the kit\'s, and Ditto does not create V3 yet', () => {
    // The dev page (a route only `vite dev` has) builds V3 tags to look at; nothing ships that does.
    const hits = sources.filter((s) => s.path !== 'blobbi/dev/BlobbiV3DevPage.tsx').filter((s) => /createBlobbiV3Identity|visualGeneration:\s*['"]v3['"]/.test(s.text)).map((s) => s.path);
    expect(hits).toEqual([]);
  });

  it('draws with the kit renderer only where V3 is drawn', () => {
    const users = sources.filter((s) => /\bBlobbiRenderer\b|\brenderBlobbiSvg\b/.test(s.text)).map((s) => s.path).sort();
    expect(users).toEqual(['blobbi/ui/BlobbiV3Visual.tsx', 'npanel/blobbi.ts']);
  });

  it('does no SVG surgery on a V3 drawing', () => {
    for (const path of ['blobbi/ui/BlobbiV3Visual.tsx', 'blobbi/ui/lib/v3-expression.ts', 'blobbi/ui/lib/v3-mouth.ts']) {
      const text = read(path);
      expect(text, path).not.toMatch(/dangerouslySetInnerHTML|innerHTML|\.replace\(|querySelector|setAttribute/);
      expect(text, path).not.toMatch(/applyVisualRecipe|addEyeAnimation|applyBodyEffects|customize\w*Svg|detectEyePositions|detectMouthPosition/);
    }
    // The renderer is handed Ditto's sanitizer; it is not bypassed.
    expect(read('blobbi/ui/BlobbiV3Visual.tsx')).toMatch(/sanitize=\{sanitize\}/);
  });
});
