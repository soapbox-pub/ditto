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

/**
 * The tag names a V3 event never carries and Ditto never handles by hand (the
 * kit reads, writes and drops them): the algorithm tag and the retired
 * pre-release V3 trait tags.
 */
const V3_TAG_NAMES = ['visual_algorithm', 'accent_color', 'antenna', 'horns', 'ears', 'tail', 'belly', 'freckles'];
const TAG_NAME = `['"](?:${V3_TAG_NAMES.join('|')})['"]`;
/**
 * Code that handles one of those names AS A TAG NAME: a tag array literal
 * (`['antenna', 'double']`), a lookup by name (`getTagValue(tags, 'horns')`,
 * `t[0] === 'tail'`), or an update through the kit's tag writers
 * (`updateBlobbiTags(tags, { belly: 'true' })`). The same word as a message,
 * a class name, a property of some other object, a case label or part of a
 * longer name is not tag handling, and is not matched.
 */
const V3_TAG_HANDLING: readonly RegExp[] = [
  new RegExp(`\\[\\s*${TAG_NAME}\\s*,`),
  new RegExp(`\\b(?:getTag|getTagValue|getTagValues|findTag|hasTag)\\s*\\([^)]*${TAG_NAME}`),
  new RegExp(`\\[0\\]\\s*===?\\s*${TAG_NAME}|${TAG_NAME}\\s*===?\\s*\\w+\\[0\\]`),
  new RegExp(`\\b(?:updateBlobbiTags|buildEggTags|syncMirrorTagsToSeed)\\s*\\([^;]*?\\{[^}]*\\b(?:${V3_TAG_NAMES.join('|')})\\s*:`),
];
const handlesV3IdentityTag = (code: string): boolean => V3_TAG_HANDLING.some((re) => re.test(code));

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
    const hits = sources.filter((s) => handlesV3IdentityTag(s.text)).map((s) => s.path);
    expect(hits).toEqual([]);
  });

  describe('the tag-handling detector', () => {
    it.each([
      "const tags = [['d', d], ['antenna', 'double']];",
      '["visual_algorithm", "1"]',
      "getTagValue(event.tags, 'horns')",
      "getTag(event, \"ears\")",
      "event.tags.find((t) => t[0] === 'tail')",
      "tags.filter((t) => 'belly' === t[0])",
      "updateBlobbiTags(tags, { state: 'active', freckles: 'true' })",
      "buildEggTags(pubkey, petId, now, name, { accent_color: '#fff' })",
    ])('flags tag handling: %s', (code) => {
      expect(handlesV3IdentityTag(code)).toBe(true);
    });

    it.each([
      'const tail = queue.tail;',
      "defaultMessage: 'Ears up!'",
      '<FormattedMessage id="pet.tail" defaultMessage="tail" />',
      'className="freckles-overlay"',
      "const horns = ['top', 'side'];",
      "['tails', 'x']",
      "traits: { antenna: 'none', horns: 'side', ears: 'round', tail: 'curl', belly: true, freckles: false }",
      "case 'antenna': return 1;",
      "getTagValue(tags, 'name')",
      "t[0] === 'seed'",
      "updateBlobbiTags(tags, { stage: 'adult', state: 'active' })",
      "const kind = cfg.visual_algorithm_label;",
    ])('passes unrelated code: %s', (code) => {
      expect(handlesV3IdentityTag(code)).toBe(false);
    });
  });

  it('makes no V3 identity: creation is the kit\'s, in one place, and the identity is read through the renderer\'s API in one place', () => {
    // Adoption asks the kit for a V3 egg (the address is the identity; nothing is stated). Nothing else creates V3
    // (the dev page, a route only `vite dev` has, asks the kit for whichever generation it shows).
    const creators = sources.filter((s) => /visualGeneration:\s*['"]v3['"]/.test(s.text)).map((s) => s.path).sort();
    expect(creators).toEqual(['blobbi/onboarding/lib/blobbi-preview.ts']);
    // The colours a V3 Blobbi is shown in come from the renderer's public identity API, in one helper; no local derivation.
    const readers = sources.filter((s) => /createBlobbiV3Identity/.test(s.text)).map((s) => s.path).sort();
    expect(readers).toEqual(['blobbi/ui/lib/display-colors.ts']);
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
