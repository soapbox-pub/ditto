/**
 * A V3 Blobbi in Ditto is the kit's drawing of the identity its event states,
 * in the state Ditto chose, through Ditto's sanitizer, and nothing else; V1
 * and V2 Blobbis keep Ditto's own pipeline.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import type { NostrEvent } from '@nostrify/nostrify';
import {
  KIND_BLOBBI_STATE,
  buildEggTags,
  deriveBlobbiV3Seed,
  getBlobbiVisualIdentity,
  getCanonicalBlobbiD,
  parseBlobbiEvent,
  updateBlobbiTags,
  type BlobbiCompanion,
} from '@blobbi-kit/core';
import { BlobbiRenderer, createBlobbiV3Identity, type BlobbiExpression } from '@blobbi-kit/renderer';

import { blobbiPicture } from '@/npanel/blobbi';
import { BlobbiCompanionVisual } from '@/blobbi/companion/components/BlobbiCompanionVisual';
import type { CompanionData } from '@/blobbi/companion/types/companion.types';

import { BlobbiStageVisual } from './BlobbiStageVisual';
import { BlobbiV3Visual } from './BlobbiV3Visual';
import { eggCrackForTourState, resolveV3Expression } from './lib/v3-expression';

const PUBKEY = 'a'.repeat(64);
const CREATED_AT = 1_757_000_000;
/** Who the V3 Blobbi at this address is: Algorithm 1's identity for its address-derived seed. */
const OWN = createBlobbiV3Identity(deriveBlobbiV3Seed(PUBKEY, getCanonicalBlobbiD(PUBKEY, '00000000a7')));

function blobbi(stage: 'egg' | 'baby' | 'adult', generation: 'v1' | 'v2' | 'v3', state: 'active' | 'sleeping' = 'active'): BlobbiCompanion {
  const egg = buildEggTags(PUBKEY, '00000000a7', CREATED_AT, 'Umber', { visualGeneration: generation });
  const tags = updateBlobbiTags(egg, { stage, state });
  const event: NostrEvent = { id: '0'.repeat(64), pubkey: PUBKEY, created_at: CREATED_AT, kind: KIND_BLOBBI_STATE, tags, content: '', sig: '0'.repeat(128) };
  return parseBlobbiEvent(event)!;
}

/** The kit's own component, unsanitized, for what Ditto must show. */
function kitBody(companion: BlobbiCompanion, props: { expression?: BlobbiExpression; isSleeping?: boolean; eyeOffset?: { x: number; y: number }; motion?: 'idle' | 'walking' | 'still' } = {}): string {
  const { container } = render(<BlobbiRenderer visual={getBlobbiVisualIdentity(companion)} instanceId={companion.d} size="100%" motion="idle" {...props} />);
  return container.querySelector('[data-blobbi-renderer]')!.innerHTML;
}

describe('BlobbiStageVisual draws V3 through the kit', () => {
  for (const stage of ['egg', 'baby', 'adult'] as const) {
    it(`a V3 ${stage} is the kit's drawing of the Blobbi at its address`, () => {
      const companion = blobbi(stage, 'v3');
      const { container } = render(<BlobbiStageVisual companion={companion} animated />);
      const root = container.querySelector('[data-blobbi-renderer]')!;
      expect(root).not.toBeNull();
      expect(root.getAttribute('data-blobbi-generation')).toBe('v3');
      expect(root.getAttribute('data-blobbi-stage')).toBe(stage);
      // Exactly the kit's markup: the sanitizer took nothing out, nothing was spliced in.
      expect(root.innerHTML).toBe(kitBody(companion, stage === 'egg' ? { motion: 'idle' } : { eyeOffset: { x: 0, y: 0 }, expression: resolveV3Expression(undefined, 'neutral') }));
      const svg = root.innerHTML;
      if (stage !== 'egg') {
        // Algorithm 1's own pattern and eye colour for this address: nothing stated, nothing else drawn.
        expect(svg).toContain(`data-pattern="${OWN.traits.pattern}"`);
        if (OWN.traits.specialMark !== 'none') expect(svg).toContain(`data-mark="${OWN.traits.specialMark}"`);
        expect(svg.toLowerCase()).toContain(OWN.colors.eye);
      }
      // No V1 eye or recipe machinery on a V3 drawing.
      expect(svg).not.toMatch(/blobbi-blink|blobbi-eye-gaze|data-clip-id/);
    });
  }

  it('sleeping is the kit\'s closed eyes, a recipe its expression, without SVG surgery', () => {
    const asleep = blobbi('adult', 'v3', 'sleeping');
    const { container } = render(<BlobbiStageVisual companion={asleep} />);
    expect(container.querySelector('[data-blobbi-renderer]')!.innerHTML).toContain('data-blobbi-eyes="closed"');

    const awake = blobbi('baby', 'v3');
    const sad = render(<BlobbiStageVisual companion={awake} emotion="sad" />);
    expect(sad.container.querySelector('[data-blobbi-renderer]')!.innerHTML)
      .toBe(kitBody(awake, { eyeOffset: { x: 0, y: 0 }, expression: { eyes: 'open', mouth: 'frown', brows: 'inner-up', blush: 'none' } }));
  });

  it('gaze is the kit\'s eye offset', () => {
    const companion = blobbi('adult', 'v3');
    const { container } = render(<BlobbiV3Visual visual={getBlobbiVisualIdentity(companion)} instanceId={companion.d} externalEyeOffset={{ x: 0.5, y: -0.25 }} />);
    const body = container.querySelector('[data-blobbi-renderer] > div') as HTMLElement;
    expect(body.style.getPropertyValue('--blobbi-eye-x')).toBe('0.5');
    expect(body.style.getPropertyValue('--blobbi-eye-y')).toBe('-0.25');
  });

  it('the floating companion walks a V3 Blobbi on its own legs, facing where it goes', () => {
    const companion = blobbi('adult', 'v3');
    const data: CompanionData = {
      d: companion.d, name: companion.name, stage: 'adult', visualTraits: companion.visualTraits, energy: 100, stats: { hunger: 100, happiness: 100, health: 100, hygiene: 100, energy: 100 },
      state: 'active', seed: companion.seed, visualGeneration: companion.visualGeneration, v3Identity: companion.v3Identity,
    };
    const { container } = render(<BlobbiCompanionVisual companion={data} size={120} eyeOffsetRef={{ current: { x: 0, y: 0 } }} direction="left" isDragging={false} isWalking />);
    const root = container.querySelector('[data-blobbi-renderer]')!;
    expect(root.getAttribute('data-blobbi-generation')).toBe('v3');
    expect(root.getAttribute('data-blobbi-facing')).toBe('left');
    expect(root.innerHTML).toContain('data-blobbi-rig-motion');
  });

  it('V1 Blobbis keep Ditto\'s own pipeline (a V2 baby or adult is the kit\'s: kit-drawn-v2.test.tsx)', () => {
    for (const stage of ['baby', 'adult'] as const) {
      const { container } = render(<BlobbiStageVisual companion={blobbi(stage, 'v1')} />);
      expect(container.querySelector('[data-blobbi-renderer]'), `v1 ${stage}`).toBeNull();
      expect(container.querySelector('[data-blobbi-kit]'), `v1 ${stage}`).toBeNull();
      expect(container.innerHTML, `v1 ${stage}`).toContain('<svg');
    }
    const egg = render(<BlobbiStageVisual companion={blobbi('egg', 'v2')} />);
    expect(egg.container.querySelector('[data-blobbi-renderer]')).toBeNull();
    expect(egg.container.querySelector('[data-blobbi-kit]')).toBeNull();
  });

  it('a link preview of a V3 Blobbi is the kit\'s drawing', () => {
    const companion = blobbi('adult', 'v3');
    const svg = blobbiPicture(companion.event)!;
    expect(svg).toMatch(/^<svg [^>]*width="1200" height="630"/);
    expect(svg).toContain('data-blobbi-generation="v3"');
    expect(svg).toContain(`data-pattern="${OWN.traits.pattern}"`);
    // The backdrop is in the Blobbi's own colours: Algorithm 1's, not the seed read in the V1 mapping.
    expect(svg.toLowerCase()).toContain(OWN.colors.base);
    expect(svg.match(/<svg\b/g)!.length).toBe(2);
  });
});

describe('a V3 Blobbi\'s eyes follow the pointer frame by frame', () => {
  afterEach(() => vi.restoreAllMocks());

  it('every frame the pointer moved, the pupils are placed where it is now, and nothing eases them there late', () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => frames.push(cb));
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});

    const companion = blobbi('adult', 'v3');
    const { container } = render(<BlobbiV3Visual visual={getBlobbiVisualIdentity(companion)} instanceId={companion.d} />);
    const root = container.querySelector('[data-blobbi-v3]') as HTMLElement;
    // The Blobbi occupies (0,0)-(200,200): its centre, the gaze origin, is (100,100).
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200, toJSON: () => ({}) });
    const body = container.querySelector('[data-blobbi-renderer] > div') as HTMLElement;
    const gaze = () => ({ x: Number(body.style.getPropertyValue('--blobbi-eye-x')), y: Number(body.style.getPropertyValue('--blobbi-eye-y')) });

    /** One animation frame: the pointer has moved to (clientX, clientY), then the gaze loop ticks. */
    const frame = (clientX: number, clientY: number) => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX, clientY }));
      const tick = frames.shift();
      expect(tick, 'the gaze loop is waiting on the next frame').toBeDefined();
      act(() => tick!(performance.now()));
    };

    // A sweep once around the Blobbi, one step per frame: each frame the
    // pupils point at the pointer's current direction, so they move every frame.
    const seen: { x: number; y: number }[] = [];
    const STEPS = 12;
    for (let i = 0; i < STEPS; i++) {
      const angle = (i / STEPS) * 2 * Math.PI;
      frame(100 + 400 * Math.cos(angle), 100 + 400 * Math.sin(angle));
      const g = gaze();
      expect(g.x, `frame ${i}`).toBeCloseTo(Math.cos(angle), 1);
      expect(g.y, `frame ${i}`).toBeCloseTo(Math.sin(angle), 1);
      seen.push(g);
    }
    for (let i = 1; i < seen.length; i++) expect(seen[i], `frame ${i} moved the eyes`).not.toEqual(seen[i - 1]);
    // A frame without pointer movement renders nothing new.
    const before = gaze();
    act(() => frames.shift()!(performance.now()));
    expect(gaze()).toEqual(before);

    // Where the per-frame placement used to be lost: the kit's gaze stylesheet
    // eases .blobbi-pupil over 250ms, and a transition retargeted every frame
    // never gets anywhere. Ditto's stylesheet turns it off under its V3 wrapper.
    const kitGazeStyle = container.querySelector('style[data-blobbi-gaze-style]')!.textContent!;
    expect(kitGazeStyle).toMatch(/^\.blobbi-pupil\{[^}]*transition:transform/);
    expect(root.querySelectorAll('.blobbi-pupil').length).toBeGreaterThan(0);
    const dittoCss = readFileSync(join(__dirname, '../../index.css'), 'utf8');
    expect(dittoCss).toMatch(/\[data-blobbi-v3\]\s+\.blobbi-pupil\s*\{\s*transition:\s*none;\s*\}/);
  });

  it('a side view keeps its (mirrored) pupils under the same rule; the back has none to move', () => {
    const companion = blobbi('adult', 'v3');
    const visual = getBlobbiVisualIdentity(companion);
    const side = render(<BlobbiV3Visual visual={visual} instanceId={companion.d} facing="left" externalEyeOffset={{ x: 0.5, y: 0 }} />);
    expect(side.container.querySelector('[data-blobbi-v3] .blobbi-pupil')).not.toBeNull();
    expect(side.container.querySelector('style[data-blobbi-gaze-style]')!.textContent).toMatch(/--blobbi-eye-x,0\) \* -/);
    const back = render(<BlobbiV3Visual visual={visual} instanceId={companion.d} facing="back" externalEyeOffset={{ x: 0.5, y: 0 }} />);
    expect(back.container.querySelector('.blobbi-pupil')).toBeNull();
    expect(back.container.querySelector('style[data-blobbi-gaze-style]')).toBeNull();
  });
});

describe('Ditto state in the kit\'s words', () => {
  it('maps recipes to expression parts', () => {
    expect(resolveV3Expression(undefined, 'neutral')).toEqual({ eyes: 'open', mouth: 'neutral', brows: 'neutral', blush: 'soft' });
    expect(resolveV3Expression(undefined, 'happy')).toEqual({ eyes: 'open', mouth: 'smile', brows: 'raised', blush: 'soft' });
    expect(resolveV3Expression(undefined, 'sad')).toEqual({ eyes: 'open', mouth: 'frown', brows: 'inner-up', blush: 'none' });
    expect(resolveV3Expression(undefined, 'angry')).toMatchObject({ mouth: 'frown', brows: 'lowered' });
    expect(resolveV3Expression(undefined, 'surprised')).toMatchObject({ mouth: 'open', brows: 'raised' });
    expect(resolveV3Expression(undefined, 'sleepy')).toMatchObject({ eyes: 'half', mouth: 'flat' });
    expect(resolveV3Expression(undefined, 'excited')).toMatchObject({ eyes: 'wide', mouth: 'grin', blush: 'strong' });
    expect(resolveV3Expression(undefined, 'blissful')).toMatchObject({ eyes: 'closed', mouth: 'grin' });
    expect(resolveV3Expression({ eyes: { sleepingClosed: true } })).toMatchObject({ eyes: 'closed' });
  });

  it('maps the hatching tour to the kit\'s egg cracks', () => {
    expect(eggCrackForTourState(undefined)).toBe('none');
    expect(eggCrackForTourState('idle')).toBe('none');
    expect(eggCrackForTourState('crack_stage_1')).toBe('light');
    expect(eggCrackForTourState('crack_stage_2')).toBe('medium');
    expect(eggCrackForTourState('crack_stage_3')).toBe('heavy');
    expect(eggCrackForTourState('hatching')).toBe('heavy');
  });
});
