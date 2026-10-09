/**
 * A V3 Blobbi in Ditto is the kit's drawing of the identity its event states,
 * in the state Ditto chose, through Ditto's sanitizer, and nothing else; V1
 * and V2 Blobbis keep Ditto's own pipeline.
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
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

  it('V1 and V2 Blobbis keep Ditto\'s own pipeline', () => {
    for (const generation of ['v1', 'v2'] as const) {
      for (const stage of ['baby', 'adult'] as const) {
        const { container } = render(<BlobbiStageVisual companion={blobbi(stage, generation)} />);
        expect(container.querySelector('[data-blobbi-renderer]'), `${generation} ${stage}`).toBeNull();
        expect(container.querySelector('[data-blobbi-v3]'), `${generation} ${stage}`).toBeNull();
        expect(container.innerHTML, `${generation} ${stage}`).toContain('<svg');
      }
    }
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
