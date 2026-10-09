/**
 * The room draws the same Blobbi from the side it walks toward. The facing is
 * presentation only: the kit renders the V3 Blobbi from that side, V1/V2 stay
 * front (Ditto's drawings have no profile), and nothing about the Blobbi
 * moves: not its event, not its identity.
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import type { NostrEvent } from '@nostrify/nostrify';
import { KIND_BLOBBI_STATE, buildEggTags, getBlobbiVisualIdentity, parseBlobbiEvent, updateBlobbiTags, type BlobbiCompanion } from '@blobbi-kit/core';
import type { BlobbiFacing } from '@blobbi-kit/renderer';

import { BlobbiGuestStage, BlobbiRoomStage } from './BlobbiRoomStage';

const PUBKEY = 'a'.repeat(64);
const CREATED_AT = 1_757_000_000;

function blobbi(generation: 'v1' | 'v3', stage: 'baby' | 'adult' = 'adult'): BlobbiCompanion {
  const tags = updateBlobbiTags(buildEggTags(PUBKEY, '00000000a7', CREATED_AT, 'Umber', { visualGeneration: generation }), { stage, state: 'active' });
  const event: NostrEvent = { id: '0'.repeat(64), pubkey: PUBKEY, created_at: CREATED_AT, kind: KIND_BLOBBI_STATE, tags, content: '', sig: '0'.repeat(128) };
  return parseBlobbiEvent(event)!;
}
const STATS = { hunger: 80, happiness: 80, health: 80, hygiene: 80, energy: 80 };

function stage(companion: BlobbiCompanion, facing?: BlobbiFacing) {
  return render(
    <BlobbiRoomStage companion={companion} currentStats={STATS} isSleeping={false} statusRecipe={undefined} statusRecipeLabel={undefined} effectiveEmotion="neutral" hasDevOverride={false} blobbiReaction="idle" facing={facing} />,
  ).container;
}
const viewOf = (container: HTMLElement) => container.querySelector('[data-blobbi-renderer] svg')?.getAttribute('data-blobbi-view') ?? null;

describe('the room stage faces where the Blobbi walks', () => {
  it('a V3 Blobbi is drawn by the kit from the given side: front by default, side for left and right, back for back', () => {
    const c = blobbi('v3');
    expect(viewOf(stage(c))).toBe('front');
    expect(viewOf(stage(c, 'front'))).toBe('front');
    expect(viewOf(stage(c, 'left'))).toBe('side');
    expect(viewOf(stage(c, 'right'))).toBe('side');
    expect(viewOf(stage(c, 'back'))).toBe('back');
    // Left and right are the one side drawing, mirrored: different markup, same Blobbi.
    const left = stage(c, 'left').querySelector('[data-blobbi-renderer]')!.innerHTML;
    const right = stage(c, 'right').querySelector('[data-blobbi-renderer]')!.innerHTML;
    expect(left).not.toBe(right);
    expect(stage(c, 'left').querySelector('[data-blobbi-renderer] svg')?.getAttribute('data-blobbi-generation')).toBe('v3');
  });

  it('a V3 baby turns too, and a visiting Blobbi turns like the user\'s', () => {
    const baby = blobbi('v3', 'baby');
    expect(viewOf(stage(baby, 'right'))).toBe('side');
    const guest = render(<BlobbiGuestStage companion={blobbi('v3')} meeting={false} facing="back" />).container;
    expect(viewOf(guest)).toBe('back');
    expect(viewOf(render(<BlobbiGuestStage companion={blobbi('v3')} meeting={false} />).container)).toBe('front');
  });

  it('a V1 Blobbi keeps its front drawing whatever the facing (Ditto\'s V1/V2 art has no profile)', () => {
    const c = blobbi('v1');
    // Ditto's V1 renderer namespaces its SVG ids per mounted instance (React's useId); that is the only difference between renders.
    const markup = (facing?: BlobbiFacing) => stage(c, facing).querySelector('[data-blobbi-visual]')!.innerHTML.replace(new RegExp(`${c.d}-[A-Za-z0-9_]+`, 'g'), 'ID');
    const front = markup();
    expect(markup('front')).toBe(front);
    for (const facing of ['left', 'right', 'back'] as const) expect(markup(facing), facing).toBe(front);
    expect(viewOf(stage(c, 'left'))).toBeNull();
  });

  it('turning changes nothing about the Blobbi: event, tags and identity are untouched', () => {
    const c = blobbi('v3');
    const before = JSON.stringify({ event: c.event, tags: c.allTags, identity: getBlobbiVisualIdentity(c), v3: c.v3Identity, seed: c.seed });
    for (const facing of ['left', 'right', 'back', 'front'] as const) stage(c, facing);
    expect(JSON.stringify({ event: c.event, tags: c.allTags, identity: getBlobbiVisualIdentity(c), v3: c.v3Identity, seed: c.seed })).toBe(before);
    expect(getBlobbiVisualIdentity(c).v3).toEqual({ seed: c.seed, algorithm: 1 });
  });
});
