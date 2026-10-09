/**
 * A V3 BLOBBI IS ITS ADDRESS, IN DITTO TOO.
 *
 * The contract (blobbi-kit 0.9.0): core derives a V3 Blobbi's seed from
 * (author pubkey, d), Algorithm 1 derives everything it looks like from that
 * seed, and the event states none of it: no seed, colour, trait, algorithm,
 * size or adult form, only `visual_generation = v3`. Ditto creates such eggs
 * now, and it receives Standalone's and Island's.
 *
 * The egg here arrives as the tags Standalone's adoption writes (the kit's
 * own V3 creation, incubating). It is pushed through every Ditto path that
 * writes a kind 31124 (each hook run for real against a mocked relay and
 * signer, the hatch and the page/widget handlers through their own tag
 * step), with a reload between each, and every intrinsic tag a replacement
 * event might forge is tried: the resolved Blobbi never moves.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import {
  BLOBBI_V3_ABSENT_TAG_NAMES,
  KIND_BLOBBI_STATE,
  VISUAL_GENERATION_TAG,
  buildEggTags,
  classifyBlobbiEvent,
  deriveBlobbiV3Seed,
  getBlobbiVisualIdentity,
  getCanonicalBlobbiD,
  getTagValue,
  parseBlobbiEvent,
  statsToTagUpdates,
  updateBlobbiTags,
  type BlobbiCompanion,
  type BlobbonautProfile,
} from '@blobbi-kit/core';
import { createBlobbiV3Identity, normalizeBlobbiV3Visual, renderBlobbiSvg, resolveBlobbiV3Visual } from '@blobbi-kit/renderer';

import { buildHatchedBabyTags } from '@/blobbi/onboarding/lib/hatch-tags';
import { generateEggPreview, previewToBlobbiCompanion, previewToEventTags } from '@/blobbi/onboarding/lib/blobbi-preview';
import { isDisplayableInteropBlobbi } from '@/blobbi/onboarding/lib/interop-recovery';
import { blobbiDisplayColors } from '@/blobbi/ui/lib/display-colors';

// ─── Relay and signer doubles ───────────────────────────────────────────────

const { relay, published } = vi.hoisted(() => ({
  relay: { events: [] as NostrEvent[] },
  published: [] as { kind: number; content: string; tags: string[][] }[],
}));

const PUBKEY = 'a'.repeat(64);

vi.mock('@nostrify/react', () => ({
  useNostr: () => ({
    nostr: {
      query: async (filters: { kinds?: number[]; '#d'?: string[] }[]) =>
        relay.events.filter((e) => filters.some((f) => (!f.kinds || f.kinds.includes(e.kind)) && (!f['#d'] || f['#d'].includes(getTagValue(e.tags, 'd') ?? '')))),
    },
  }),
}));
vi.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ user: { pubkey: PUBKEY } }) }));
vi.mock('@/hooks/useNostrPublish', () => ({
  useNostrPublish: () => ({
    mutateAsync: async (t: { kind: number; content: string; tags: string[][] }) => {
      published.push(t);
      return eventWith(t.tags, (relay.events.at(-1)?.created_at ?? CREATED_AT) + 60, t.content, t.kind);
    },
  }),
}));
vi.mock('@/hooks/useToast', () => ({ toast: vi.fn(), useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useBlobbonautProfile', () => ({
  useBlobbonautProfile: () => ({ profile: { currentCompanion: D } }),
}));

// ─── The Blobbi ──────────────────────────────────────────────────────────────

const CREATED_AT = 1_757_000_000;
const PET_ID = '00000000a7';
const D = getCanonicalBlobbiD(PUBKEY, PET_ID);
/** The Blobbi's seed: its address, hashed by the kit. No tag states it. */
const SEED = deriveBlobbiV3Seed(PUBKEY, D);
/** Who it is: Algorithm 1's identity for its address. */
const OWN = createBlobbiV3Identity(SEED);
const V3 = { seed: SEED, algorithm: 1 };

/**
 * The egg exactly as Blobbi Standalone (feat/v3-address-seed) adopts it: the
 * kit's own V3 creation, incubating. It states nothing about its looks.
 */
const STANDALONE_EGG_TAGS: string[][] = updateBlobbiTags(
  buildEggTags(PUBKEY, PET_ID, CREATED_AT, 'Umber', { visualGeneration: 'v3' }),
  { progression_state: 'incubating', progression_started_at: String(CREATED_AT) },
);

/** Every intrinsic tag a replacement event might try to state, each with a value this Blobbi does not have. */
const FORGERIES: string[][] = [
  ['seed', 'f'.repeat(64)],
  ['visual_algorithm', '2'],
  ['base_color', '#000000'],
  ['secondary_color', '#ffffff'],
  ['eye_color', '#ff0000'],
  ['accent_color', '#00ff00'],
  ['antenna', OWN.traits.antenna === 'double' ? 'none' : 'double'],
  ['horns', OWN.traits.horns === 'side' ? 'none' : 'side'],
  ['ears', OWN.traits.ears === 'pointed' ? 'none' : 'pointed'],
  ['tail', OWN.traits.tail === 'leaf' ? 'none' : 'leaf'],
  ['pattern', OWN.traits.pattern === 'striped' ? 'solid' : 'striped'],
  ['special_mark', OWN.traits.specialMark === 'moon' ? 'none' : 'moon'],
  ['belly', String(!OWN.traits.belly)],
  ['freckles', String(!OWN.traits.freckles)],
  ['size', 'large'],
  ['adult_type', 'catti'],
];

function eventWith(tags: string[][], at: number, content = '', kind = KIND_BLOBBI_STATE): NostrEvent {
  return { id: at.toString(16).padStart(64, '0'), pubkey: PUBKEY, created_at: at, kind, tags, content, sig: '0'.repeat(128) };
}
const reload = (event: NostrEvent): NostrEvent => JSON.parse(JSON.stringify(event));
function parse(event: NostrEvent): BlobbiCompanion {
  const companion = parseBlobbiEvent(reload(event));
  if (!companion || companion.isLegacy) throw new Error('must parse as a modern Blobbi');
  return companion;
}

/** Fails if the address moved, a V3 event gained what V3 does not have, or the resolved Blobbi changed. */
function expectSameIndividual(event: NostrEvent, label: string) {
  expect(getTagValue(event.tags, 'd'), label).toBe(D);
  expect(event.tags.filter((t) => t[0] === VISUAL_GENERATION_TAG), label).toEqual([[VISUAL_GENERATION_TAG, 'v3']]);
  for (const name of [...BLOBBI_V3_ABSENT_TAG_NAMES, 'spots']) expect(getTagValue(event.tags, name), `${label}: ${name}`).toBeUndefined();
  expect(getTagValue(event.tags, 'generation'), `${label}: generation`).toBe('1');
  const companion = parse(event);
  expect(companion.visualGeneration, label).toBe('v3');
  expect(companion.v3Identity, label).toEqual({ ...V3, missing: [] });
  expect(getBlobbiVisualIdentity(companion).v3, label).toEqual(V3);
  expect(normalizeBlobbiV3Visual(getBlobbiVisualIdentity(companion).v3), label).toEqual(OWN);
}

/** Puts an event "on the relay" as the newest version of the Blobbi. */
function onRelay(event: NostrEvent): NostrEvent {
  relay.events = [...relay.events.filter((e) => e.kind !== KIND_BLOBBI_STATE), event];
  return event;
}
/** What the last write published, as the relay would return it. */
function lastWrite(): NostrEvent {
  const t = published.filter((p) => p.kind === KIND_BLOBBI_STATE).at(-1);
  if (!t) throw new Error('nothing was published');
  return onRelay(eventWith(t.tags, (relay.events.at(-1)?.created_at ?? CREATED_AT) + 60, t.content));
}
const canonicalOf = (event: NostrEvent) => async () => {
  const companion = parse(event);
  return { companion, content: event.content, allTags: companion.allTags, profileAllTags: [] as string[][] };
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const PROFILE = { d: `blobbonaut-${PUBKEY.slice(0, 12)}`, allTags: [], has: [D], currentCompanion: D } as unknown as BlobbonautProfile;

beforeEach(() => {
  relay.events = [];
  published.length = 0;
});

// ─── Parsing ─────────────────────────────────────────────────────────────────

describe('Ditto reads the final V3 identity', () => {
  it('a Standalone egg parses to its address seed under Algorithm 1; what Ditto shows it in is Algorithm 1\'s colours', () => {
    const egg = parse(eventWith(STANDALONE_EGG_TAGS, CREATED_AT));
    expect(egg.visualGeneration).toBe('v3');
    expect(egg.v3Identity).toEqual({ ...V3, missing: [] });
    expect(egg.generation).toBe(1);
    expect(egg.adultType).toBeUndefined();
    for (const name of BLOBBI_V3_ABSENT_TAG_NAMES) expect(getTagValue(egg.allTags, name), name).toBeUndefined();
    // The plain trait fields are the seed read in the V1 mapping, NOT the Blobbi's colours; Ditto shows Algorithm 1's.
    expect(egg.visualTraits.baseColor.toLowerCase()).not.toBe(OWN.colors.base);
    expect(blobbiDisplayColors(egg)).toEqual({ baseColor: OWN.colors.base, secondaryColor: OWN.colors.secondary, eyeColor: OWN.colors.eye });
    // And the drawing is of the address.
    const visual = getBlobbiVisualIdentity(egg);
    expect(visual.v3).toEqual(V3);
    const resolved = resolveBlobbiV3Visual(visual.v3!);
    expect(resolved.status).toBe('individual');
    expect(resolved.status === 'individual' && resolved.identity).toEqual(OWN);
    // It is displayable through the interop path too, with no seed tag.
    expect(isDisplayableInteropBlobbi(eventWith([...STANDALONE_EGG_TAGS, ['client', 'blobbi']], CREATED_AT))).toBe(true);
  });

  it('the same tags under another author are another Blobbi; the same address at another time is the same one', () => {
    const other = parseBlobbiEvent({ ...eventWith(STANDALONE_EGG_TAGS, CREATED_AT), pubkey: 'b'.repeat(64) })!;
    expect(other.v3Identity?.seed).toBe(deriveBlobbiV3Seed('b'.repeat(64), D));
    expect(other.v3Identity?.seed).not.toBe(SEED);
    expect(normalizeBlobbiV3Visual(getBlobbiVisualIdentity(other).v3)).not.toEqual(OWN);
    expect(parse(eventWith(STANDALONE_EGG_TAGS, CREATED_AT + 999_999)).v3Identity).toEqual({ ...V3, missing: [] });
  });

  it.each(FORGERIES.map((f) => [f[0], f[1]] as const))('a replacement event stating %s = %s changes nothing, and the next kit write drops it', (name, value) => {
    const forged = eventWith([...STANDALONE_EGG_TAGS, [name, value]], CREATED_AT + 1);
    expect(classifyBlobbiEvent(forged)).toBe('modern');
    const companion = parse(forged);
    expect(companion.v3Identity).toEqual({ ...V3, missing: [] });
    const draw = (c: BlobbiCompanion) => renderBlobbiSvg({ ...getBlobbiVisualIdentity(c), instanceId: 'x' }).svg;
    expect(draw(companion)).toBe(draw(parse(eventWith(STANDALONE_EGG_TAGS, CREATED_AT))));
    expect(blobbiDisplayColors(companion).baseColor).toBe(OWN.colors.base);
    expectSameIndividual(eventWith(updateBlobbiTags(companion.allTags, { state: 'sleeping' }), CREATED_AT + 2), `after ${name}`);
  });

  it('all forgeries at once, too', () => {
    const forged = eventWith([...STANDALONE_EGG_TAGS, ...FORGERIES], CREATED_AT + 1);
    expect(parse(forged).v3Identity).toEqual({ ...V3, missing: [] });
    expectSameIndividual(eventWith(updateBlobbiTags(parse(forged).allTags, { hunger: '50' }), CREATED_AT + 2), 'all forged');
  });

  it('a V3 event with no single well-formed address is no modern Blobbi, and is never repaired into one', () => {
    const twoD = eventWith([...STANDALONE_EGG_TAGS, ['d', D]], CREATED_AT);
    expect(classifyBlobbiEvent(twoD)).toBe('legacy');
    expect(parseBlobbiEvent(twoD)?.v3Identity?.missing).toEqual(['seed']);
    expect(classifyBlobbiEvent({ ...eventWith(STANDALONE_EGG_TAGS, CREATED_AT), pubkey: PUBKEY.toUpperCase() })).toBe('legacy');
  });
});

// ─── Every Ditto write path ──────────────────────────────────────────────────

describe('every Ditto write path keeps the V3 identity', () => {
  /** The egg on the relay, hatched by the ceremony's own tag step. */
  function hatchedBaby(): NostrEvent {
    const egg = onRelay(eventWith(STANDALONE_EGG_TAGS, CREATED_AT));
    expectSameIndividual(egg, 'egg');
    const baby = onRelay(eventWith(buildHatchedBabyTags(parse(egg).allTags, {}, CREATED_AT + 3600), CREATED_AT + 3600));
    expect(parse(baby).stage).toBe('baby');
    expectSameIndividual(baby, 'hatch');
    return baby;
  }

  it('hatch (the ceremony), then the kit evolve Ditto runs (useBlobbiEvolve)', async () => {
    const baby = hatchedBaby();
    const { useBlobbiEvolve } = await import('@/blobbi/actions/hooks/useBlobbiStageTransition');
    const { result } = renderHook(() => useBlobbiEvolve({
      companion: parse(baby), profile: PROFILE, ensureCanonicalBeforeAction: canonicalOf(baby), updateCompanionEvent: vi.fn(),
    }), { wrapper });
    await act(() => result.current.mutateAsync());
    const adult = lastWrite();
    expect(parse(adult).stage).toBe('adult');
    expectSameIndividual(adult, 'evolve');
  });

  it('care: sleep and wake (useBlobbiSleepToggle), play and sing (useBlobbiDirectAction), food (useBlobbiUseInventoryItem)', async () => {
    let event = hatchedBaby();
    const { useBlobbiSleepToggle } = await import('@/blobbi/companion/interaction/useBlobbiSleepToggle');
    const { useBlobbiDirectAction } = await import('@/blobbi/actions/hooks/useBlobbiDirectAction');
    const { useBlobbiUseInventoryItem } = await import('@/blobbi/actions/hooks/useBlobbiUseInventoryItem');

    for (const step of ['sleep', 'wake'] as const) {
      const { result } = renderHook(() => useBlobbiSleepToggle(), { wrapper });
      await act(() => result.current.toggleSleep());
      event = lastWrite();
      expect(parse(event).state).toBe(step === 'sleep' ? 'sleeping' : 'active');
      expectSameIndividual(event, step);
    }

    for (const action of ['play_music', 'sing'] as const) {
      const current = event;
      const { result } = renderHook(() => useBlobbiDirectAction({
        companion: parse(current), ensureCanonicalBeforeAction: canonicalOf(current), updateCompanionEvent: vi.fn(),
      }), { wrapper });
      await act(() => result.current.mutateAsync({ action }));
      event = lastWrite();
      expectSameIndividual(event, action);
    }

    const current = event;
    const { result } = renderHook(() => useBlobbiUseInventoryItem({
      companion: parse(current), profile: PROFILE, ensureCanonicalBeforeAction: canonicalOf(current), updateCompanionEvent: vi.fn(), updateProfileEvent: vi.fn(),
    }), { wrapper });
    await act(() => result.current.mutateAsync({ itemId: 'food_apple', action: 'feed' }));
    event = lastWrite();
    expectSameIndividual(event, 'feed');
  });

  it('the dev editor: a stat, a genealogical generation, and an adult form it must not apply to V3', async () => {
    const baby = hatchedBaby();
    const { useBlobbiDevUpdate } = await import('@/blobbi/dev/useBlobbiDevUpdate');
    const { result } = renderHook(() => useBlobbiDevUpdate({ companion: parse(baby), updateCompanionEvent: vi.fn() }), { wrapper });
    await act(() => result.current.mutateAsync({ stage: 'adult', adultType: 'catti', stats: { hunger: 40 }, generation: 3 }));
    const event = lastWrite();
    // The genealogical generation is the editor's to set; it is not the artwork.
    expect(getTagValue(event.tags, 'generation')).toBe('3');
    const restated = event.tags.map((t) => (t[0] === 'generation' ? ['generation', '1'] : t));
    expectSameIndividual(eventWith(restated, event.created_at), 'dev editor');
    expect(parse(event).visualGeneration).toBe('v3');
  });

  it('the page and widget handlers, each through the tag step it publishes', () => {
    // Each line is the exact update a handler merges onto the fresh event's
    // own tags: BlobbiPage rest/wake, the widget's rest/wake, the social
    // toggle, the poop-cleanup XP, the ceremony's rename.
    const now = CREATED_AT + 7200;
    let event = hatchedBaby();
    const steps: [string, (c: BlobbiCompanion) => Record<string, string>][] = [
      ['page rest', () => ({ state: 'sleeping', ...statsToTagUpdates({ hunger: 80, happiness: 70, health: 90, hygiene: 60, energy: 50 }, now) })],
      ['widget wake', (c) => ({ state: 'active', hunger: String(c.stats.hunger), happiness: String(c.stats.happiness), health: String(c.stats.health), hygiene: String(c.stats.hygiene), energy: String(c.stats.energy), last_interaction: String(now), last_decay_at: String(now) })],
      ['social open', () => ({ social: 'open' })],
      ['poop xp', (c) => ({ experience: String((c.experience ?? 0) + 5) })],
      ['rename', () => ({ name: 'Umbra' })],
    ];
    for (const [label, update] of steps) {
      const companion = parse(event);
      event = eventWith(updateBlobbiTags(companion.allTags, update(companion)), event.created_at + 60, event.content);
      expectSameIndividual(event, label);
    }
    expect(parse(event).name).toBe('Umbra');
  });
});

// ─── V1 and V2 stay what they are ────────────────────────────────────────────

describe('Ditto creates canonical V3 eggs; V1 and V2 are unchanged', () => {
  it('a new Ditto adoption is a canonical V3 egg: the address, visual_generation=v3, incubating, and nothing stated about its looks', () => {
    const preview = generateEggPreview(PUBKEY, 'Pip');
    expect(preview.seed).toBe(deriveBlobbiV3Seed(PUBKEY, preview.d));
    const tags = previewToEventTags(preview);
    expect(tags.filter((t) => t[0] === VISUAL_GENERATION_TAG)).toEqual([[VISUAL_GENERATION_TAG, 'v3']]);
    for (const name of [...BLOBBI_V3_ABSENT_TAG_NAMES, 'spots']) expect(getTagValue(tags, name), name).toBeUndefined();
    expect(getTagValue(tags, 'stage')).toBe('egg');
    expect(getTagValue(tags, 'progression_state')).toBe('incubating');
    expect(getTagValue(tags, 'progression_started_at')).toBe(String(preview.createdAt));
    const egg = parse(eventWith(tags, preview.createdAt));
    expect(egg.v3Identity).toEqual({ seed: preview.seed, algorithm: 1, missing: [] });
    // The preview IS the egg: the same companion, the same drawing.
    const shown = previewToBlobbiCompanion(preview);
    expect(getBlobbiVisualIdentity(shown)).toEqual(getBlobbiVisualIdentity(egg));
    const draw = (c: BlobbiCompanion) => renderBlobbiSvg({ ...getBlobbiVisualIdentity(c), instanceId: 'p' }).svg;
    expect(draw(shown)).toBe(draw(egg));
    // Hatched by the ceremony's own step: the same Blobbi, now a baby.
    const baby = parse(eventWith(buildHatchedBabyTags(egg.allTags, {}, preview.createdAt + 3600), preview.createdAt + 3600));
    expect(baby.stage).toBe('baby');
    expect(baby.v3Identity).toEqual(egg.v3Identity);
    for (const name of BLOBBI_V3_ABSENT_TAG_NAMES) expect(getTagValue(baby.allTags, name), name).toBeUndefined();
  });

  it('V1 and V2 Blobbis hatch and are cared for without gaining V3 tags or changing generation', () => {
    for (const generation of ['v1', 'v2'] as const) {
      const egg = eventWith(buildEggTags(PUBKEY, PET_ID, CREATED_AT, 'Old', { visualGeneration: generation }), CREATED_AT);
      let event = eventWith(buildHatchedBabyTags(parse(egg).allTags, {}, CREATED_AT + 60), CREATED_AT + 60);
      event = eventWith(updateBlobbiTags(parse(event).allTags, { state: 'sleeping', experience: '10' }), CREATED_AT + 120);
      const companion = parse(event);
      expect(companion.visualGeneration, generation).toBe(generation);
      expect(companion.v3Identity, generation).toBeUndefined();
      expect(getTagValue(event.tags, 'visual_algorithm'), generation).toBeUndefined();
      for (const name of ['antenna', 'horns', 'ears', 'tail', 'belly', 'freckles', 'accent_color']) expect(getTagValue(event.tags, name), `${generation} ${name}`).toBeUndefined();
      // The seed is untouched; V1/V2 colour tags remain the seed's mirrors, and are what Ditto shows.
      expect(getTagValue(event.tags, 'seed')).toBe(getTagValue(egg.tags, 'seed'));
      expect(getTagValue(event.tags, 'base_color')).toBe(getTagValue(egg.tags, 'base_color'));
      expect(blobbiDisplayColors(companion).baseColor).toBe(companion.visualTraits.baseColor);
    }
  });
});
