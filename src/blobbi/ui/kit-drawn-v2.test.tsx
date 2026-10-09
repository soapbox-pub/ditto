/**
 * A V2 Blobbi born elsewhere (Blobbi Island, Standalone) is, in Ditto, the
 * kit's V2 Blobbi: classified V2, drawn by `@blobbi-kit/renderer` through
 * Ditto's sanitizer with its gradient inheritance intact, and not Ditto's V1
 * form of the same adult type. V1 keeps Ditto's own pipeline, and so do the V2
 * egg and baby, which the kit draws with the same art Ditto already draws
 * (lib/kit-drawn.ts). Drawing changes no event and no Blobbi.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import type { NostrEvent } from '@nostrify/nostrify';
import {
  KIND_BLOBBI_STATE,
  buildEggTags,
  getBlobbiVisualIdentity,
  getTagValue,
  parseBlobbiEvent,
  updateBlobbiTags,
  type BlobbiCompanion,
} from '@blobbi-kit/core';
import { BlobbiRenderer, type BlobbiRendererProps } from '@blobbi-kit/renderer';

import { blobbiPicture } from '@/npanel/blobbi';
import { BlobbiCompanionVisual } from '@/blobbi/companion/components/BlobbiCompanionVisual';
import type { CompanionData } from '@/blobbi/companion/types/companion.types';

import { BlobbiStageVisual } from './BlobbiStageVisual';
import { BlobbiV3Visual } from './BlobbiV3Visual';
import { isKitDrawn } from './lib/kit-drawn';
import { resolveV3Expression } from './lib/v3-expression';

// ─── Fixture: a V2 Blobbi as Island and Standalone write one ─────────────────
// Both create V2 with the kit's own `buildEggTags(…, { visualGeneration: 'v2' })`
// and advance it with `updateBlobbiTags`; the same calls, from the same core,
// make this fixture, so it is the event Ditto receives from them.
const PUBKEY = 'a'.repeat(64);
const PET_ID = '00000000a7';
const CREATED_AT = 1_757_000_000;

type Generation = 'v1' | 'v2' | 'v3';
type Stage = 'egg' | 'baby' | 'adult';

function eventOf(generation: Generation, stage: Stage, state: 'active' | 'sleeping' = 'active'): NostrEvent {
  const egg = buildEggTags(PUBKEY, PET_ID, CREATED_AT, 'Umber', { visualGeneration: generation });
  const tags = stage === 'egg' ? egg : updateBlobbiTags(egg, { stage, state });
  return { id: '0'.repeat(64), pubkey: PUBKEY, created_at: CREATED_AT, kind: KIND_BLOBBI_STATE, tags, content: '', sig: '0'.repeat(128) };
}

const blobbi = (generation: Generation, stage: Stage, state: 'active' | 'sleeping' = 'active'): BlobbiCompanion =>
  parseBlobbiEvent(eventOf(generation, stage, state))!;

/** The kit's own drawing of a Blobbi, unsanitized: what Ditto must show, in the id namespace of the Ditto drawing it is compared with. */
function kitBody(companion: BlobbiCompanion, props: Partial<BlobbiRendererProps> = {}, instanceId = companion.d): string {
  const { container } = render(<BlobbiRenderer visual={getBlobbiVisualIdentity(companion)} instanceId={instanceId} size="100%" motion="idle" {...props} />);
  return container.querySelector('[data-blobbi-renderer]')!.innerHTML;
}

/** The SVG id namespace Ditto gave a mounted drawing. */
const instanceOf = (root: Element) => root.closest('[data-blobbi-instance]')!.getAttribute('data-blobbi-instance')!;

/** What Ditto draws for a Blobbi: the kit's body box inside its wrapper. */
function dittoBody(companion: BlobbiCompanion, props: Partial<Parameters<typeof BlobbiStageVisual>[0]> = {}) {
  const { container } = render(<BlobbiStageVisual companion={companion} animated {...props} />);
  return { container, root: container.querySelector('[data-blobbi-renderer]') };
}

const NEUTRAL = { eyeOffset: { x: 0, y: 0 }, expression: resolveV3Expression(undefined, 'neutral') } as const;

/** Element and attribute inventory of an SVG string: the same drawing has the same inventory. */
function inventory(svg: string) {
  const tags: Record<string, number> = {};
  for (const m of svg.matchAll(/<([a-zA-Z][\w:-]*)/g)) tags[m[1]] = (tags[m[1]] ?? 0) + 1;
  const attrs = new Set([...svg.matchAll(/\s([a-zA-Z][\w:-]*)=/g)].map((m) => m[1]));
  return { tags, attrs };
}

/** Ditto's sanitizer may drop only the XML prolog (`version`, `encoding`) and the xlink namespace declaration; nothing drawn. */
const PROLOG_ONLY = ['encoding', 'version', 'xmlns:xlink'];
function expectSameDrawing(ditto: string, kit: string, label: string) {
  const a = inventory(kit);
  const b = inventory(ditto);
  expect(b.tags, label).toEqual(a.tags);
  expect([...a.attrs].filter((name) => !b.attrs.has(name)).sort(), label).toEqual(PROLOG_ONLY.filter((name) => a.attrs.has(name)));
  expect([...b.attrs].filter((name) => !a.attrs.has(name)), label).toEqual([]);
}

const gradientLinks = (svg: string) => [...svg.matchAll(/xlink:href="(#[^"]+)"/g)].map((m) => m[1]).sort();

describe('a V2 Blobbi is classified V2', () => {
  it('reads as V2 at every stage, with no V3 identity, and the kit draws its adult', () => {
    for (const stage of ['egg', 'baby', 'adult'] as const) {
      const companion = blobbi('v2', stage);
      expect(companion.visualGeneration, stage).toBe('v2');
      expect(companion.v3Identity, stage).toBeUndefined();
      expect(getTagValue(companion.allTags, 'visual_generation'), stage).toBe('v2');
      expect(isKitDrawn(companion), stage).toBe(stage === 'adult');
    }
    for (const stage of ['egg', 'baby', 'adult'] as const) expect(isKitDrawn(blobbi('v1', stage)), `v1 ${stage}`).toBe(false);
    for (const stage of ['egg', 'baby', 'adult'] as const) expect(isKitDrawn(blobbi('v3', stage)), `v3 ${stage}`).toBe(true);
  });
});

describe('a V2 Blobbi is the kit\'s V2 Blobbi in Ditto', () => {
  it('a V2 adult is the kit\'s V2 body through Ditto\'s sanitizer, gradient inheritance intact, not Ditto\'s V1 form of its adult type', () => {
    const companion = blobbi('v2', 'adult');
    expect(companion.adultType).toBeDefined();
    const { container, root } = dittoBody(companion);
    expect(root).not.toBeNull();
    expect(root!.getAttribute('data-blobbi-generation')).toBe('v2');
    expect(root!.getAttribute('data-blobbi-stage')).toBe('adult');
    expect(container.querySelector('[data-blobbi-kit="v2"]')).not.toBeNull();
    expect(container.querySelector('[data-blobbi-v3]')).toBeNull();

    const svg = root!.innerHTML;
    // The kit's V2 artwork, by its own markers; none of Ditto's V1 machinery.
    expect(svg).toContain('data-blobbi-generation="v2"');
    expect(svg).toContain('data-part="mouth"');
    expect(svg).not.toMatch(/blobbi-blink|blobbi-eye-gaze|data-clip-id|<!-- Mouth|blobbiinstancetoken/);

    expectSameDrawing(svg, kitBody(companion, NEUTRAL), 'v2 adult');
    // Gradient inheritance: all eight derived gradients still link to their sources, and every fill resolves.
    const links = gradientLinks(svg);
    expect(links.length).toBe(8);
    expect(links).toEqual(gradientLinks(kitBody(companion, NEUTRAL, instanceOf(root!))));
    for (const id of links) expect(svg, id).toContain(`id="${id.slice(1)}"`);
    for (const m of svg.matchAll(/url\(#([^)]+)\)/g)) expect(svg, m[1]).toContain(`id="${m[1]}"`);
  });

  it('a V2 baby stays on Ditto\'s pipeline: the kit has no V2 baby art and draws the V1 baby, which is Ditto\'s own', () => {
    // The kit's V2 baby is its V1 baby, byte for byte.
    const { container: v2Kit } = render(<BlobbiRenderer visual={getBlobbiVisualIdentity(blobbi('v2', 'baby'))} instanceId="same" size="100%" {...NEUTRAL} />);
    const { container: v1Kit } = render(<BlobbiRenderer visual={getBlobbiVisualIdentity(blobbi('v1', 'baby'))} instanceId="same" size="100%" {...NEUTRAL} />);
    expect(v2Kit.querySelector('[data-blobbi-renderer]')!.innerHTML).toBe(v1Kit.querySelector('[data-blobbi-renderer]')!.innerHTML);
    // So Ditto keeps drawing it itself, with its blink and eye machinery.
    const { container, root } = dittoBody(blobbi('v2', 'baby'));
    expect(root).toBeNull();
    expect(container.querySelector('[data-blobbi-kit]')).toBeNull();
    expect(container.innerHTML).toMatch(/blobbi-eye-gaze/);
  });

  it('a V2 egg stays Ditto\'s egg; V1 babies and adults stay Ditto\'s own pipeline', () => {
    const egg = dittoBody(blobbi('v2', 'egg'));
    expect(egg.root).toBeNull();
    expect(egg.container.querySelector('[data-blobbi-kit]')).toBeNull();
    for (const stage of ['baby', 'adult'] as const) {
      const { container, root } = dittoBody(blobbi('v1', stage));
      expect(root, `v1 ${stage}`).toBeNull();
      expect(container.querySelector('[data-blobbi-kit]'), `v1 ${stage}`).toBeNull();
      // Ditto's eye machinery is there, as before.
      expect(container.innerHTML, `v1 ${stage}`).toMatch(/blobbi-eye-gaze/);
    }
  });

  it('sleeping is the kit\'s closed eyes; a recipe or emotion is the kit\'s expression', () => {
    const awake = blobbi('v2', 'adult');
    const asleep = blobbi('v2', 'adult', 'sleeping');
    const awakeSvg = dittoBody(awake).root!.innerHTML;
    const asleepSvg = dittoBody(asleep).root!.innerHTML;
    expect(asleepSvg).not.toBe(awakeSvg);
    expectSameDrawing(asleepSvg, kitBody(asleep, { isSleeping: true, expression: resolveV3Expression(undefined, 'neutral') }), 'v2 asleep');

    const sadSvg = dittoBody(awake, { emotion: 'sad' }).root!.innerHTML;
    expect(sadSvg).not.toBe(awakeSvg);
    expectSameDrawing(sadSvg, kitBody(awake, { eyeOffset: { x: 0, y: 0 }, expression: { eyes: 'open', mouth: 'frown', brows: 'inner-up', blush: 'none' } }), 'v2 sad');
  });

  it('its gaze is the kit\'s: pupils in front, one mirrored on the side, none on the back, and no transition under Ditto\'s wrapper', () => {
    const companion = blobbi('v2', 'adult');
    const visual = getBlobbiVisualIdentity(companion);
    const draw = (facing: 'front' | 'left' | 'back') =>
      render(<BlobbiV3Visual visual={visual} instanceId={companion.d} facing={facing} externalEyeOffset={{ x: 0.5, y: -0.25 }} />).container;

    const front = draw('front');
    expect(front.querySelectorAll('[data-blobbi-kit="v2"] .blobbi-pupil').length).toBe(2);
    const body = front.querySelector('[data-blobbi-renderer] > div') as HTMLElement;
    expect(body.style.getPropertyValue('--blobbi-eye-x')).toBe('0.5');
    expect(body.style.getPropertyValue('--blobbi-eye-y')).toBe('-0.25');
    expect(front.querySelector('style[data-blobbi-gaze-style]')!.textContent).toMatch(/^\.blobbi-pupil\{/);

    const side = draw('left');
    expect(side.querySelectorAll('.blobbi-pupil').length).toBe(1);
    expect(side.querySelector('style[data-blobbi-gaze-style]')!.textContent).toMatch(/--blobbi-eye-x,0\) \* -/);

    const back = draw('back');
    expect(back.querySelector('.blobbi-pupil')).toBeNull();
    expect(back.querySelector('style[data-blobbi-gaze-style]')).toBeNull();

    // The continuous-gaze rule (index.css) covers a kit-drawn V2 as it covers V3.
    const css = readFileSync(join(__dirname, '../../index.css'), 'utf8');
    expect(css).toMatch(/\[data-blobbi-kit\]\s+\.blobbi-pupil\s*\{\s*transition:\s*none;\s*\}/);
  });

  it('the floating companion walks a V2 Blobbi on the kit\'s rig, facing where it goes', () => {
    const companion = blobbi('v2', 'adult');
    const data: CompanionData = {
      d: companion.d, name: companion.name, stage: 'adult', visualTraits: companion.visualTraits, energy: 100, stats: { hunger: 100, happiness: 100, health: 100, hygiene: 100, energy: 100 },
      state: 'active', seed: companion.seed, visualGeneration: companion.visualGeneration, adultType: companion.adultType,
    };
    const { container } = render(<BlobbiCompanionVisual companion={data} size={120} eyeOffsetRef={{ current: { x: 0, y: 0 } }} direction="left" isDragging={false} isWalking />);
    const root = container.querySelector('[data-blobbi-renderer]')!;
    expect(root).not.toBeNull();
    expect(root.getAttribute('data-blobbi-generation')).toBe('v2');
    expect(root.getAttribute('data-blobbi-facing')).toBe('left');
    // Walking is the kit's motion on the V2 artwork (its legs have phases), not Ditto's sway.
    expect(root.innerHTML).toContain('data-blobbi-motion="walking"');
    expect(container.querySelector('.blobbi-eye-gaze-left')).toBeNull();
  });

  it('a link preview of a V2 adult is the kit\'s drawing; of a V2 egg, Ditto\'s egg', () => {
    const adult = blobbiPicture(eventOf('v2', 'adult'))!;
    expect(adult).toContain('data-blobbi-generation="v2"');
    expect(adult).toContain('data-part="mouth"');
    expect(adult.match(/<svg\b/g)!.length).toBe(2);
    const egg = blobbiPicture(eventOf('v2', 'egg'))!;
    expect(egg).not.toContain('data-blobbi-generation');
    expect(egg).toContain('id="egg-shell"');
  });
});

describe('drawing changes nothing', () => {
  it('neither the event nor the parsed Blobbi changes when a V1, V2 or V3 Blobbi is drawn', () => {
    for (const generation of ['v1', 'v2', 'v3'] as const) {
      for (const stage of ['egg', 'baby', 'adult'] as const) {
        const event = eventOf(generation, stage);
        const eventBefore = JSON.stringify(event);
        const companion = parseBlobbiEvent(event)!;
        const companionBefore = JSON.stringify(companion);
        render(<BlobbiStageVisual companion={companion} animated emotion="happy" />);
        render(<BlobbiStageVisual companion={companion} emotion="sad" />);
        blobbiPicture(event);
        expect(JSON.stringify(event), `${generation} ${stage}`).toBe(eventBefore);
        expect(JSON.stringify(companion), `${generation} ${stage}`).toBe(companionBefore);
        expect(parseBlobbiEvent(event)!.visualGeneration, `${generation} ${stage}`).toBe(generation);
      }
    }
  });
});
