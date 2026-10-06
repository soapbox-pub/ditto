/**
 * A V3 BLOBBI'S IDENTITY IS DECIDED ONCE AND NEVER MOVES, IN DITTO TOO.
 *
 * The contract (blobbi-kit f3acbf4, `visual_algorithm = 1`): creation chooses
 * the explicit identity (four colours, the kind of each trait) once; the event
 * states it; every later update preserves what the event states and derives
 * nothing from the seed again.
 *
 * The Blobbi here is deliberately NOT what its seed would have chosen (the
 * same individual Blobbi Standalone's identity test uses), and it arrives as
 * the tags Standalone's adoption writes. It is pushed through every Ditto path
 * that writes a kind 31124 (each hook run for real against a mocked relay and
 * signer, the hatch and the page/widget handlers through their own tag step),
 * with a reload between each; one tag moving fails the test.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import {
  BLOBBI_V3_TAG_NAMES,
  KIND_BLOBBI_STATE,
  VISUAL_GENERATION_TAG,
  buildEggTags,
  canonicalBlobbiV3Seed,
  classifyBlobbiEvent,
  deriveBlobbiSeedV1,
  getBlobbiVisualIdentity,
  getCanonicalBlobbiD,
  getTagValue,
  parseBlobbiEvent,
  statsToTagUpdates,
  updateBlobbiTags,
  type BlobbiCompanion,
  type BlobbiV3Identity,
  type BlobbonautProfile,
} from '@blobbi-kit/core';
import { createBlobbiV3Identity, renderBlobbiSvg, resolveBlobbiV3Visual } from '@blobbi-kit/renderer';

import { buildHatchedBabyTags } from '@/blobbi/onboarding/lib/hatch-tags';
import { generateEggPreview, previewToEventTags } from '@/blobbi/onboarding/lib/blobbi-preview';
import { V3_REFERENCE_BLOBBIS } from '@/blobbi/dev/v3-reference';

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
const SEED = deriveBlobbiSeedV1(PUBKEY, D, CREATED_AT);

/** Not what the seed would choose (Standalone's identity test uses the same one). */
const UNUSUAL: BlobbiV3Identity = {
  seed: SEED,
  algorithm: 1,
  colors: { base: '#2b3a67', secondary: '#ffd23f', eye: '#e85d75', accent: '#7ad3f4' },
  traits: { antenna: 'double', horns: 'side', ears: 'pointed', tail: 'leaf', pattern: 'striped', specialMark: 'moon', belly: true, freckles: true },
};

/**
 * The egg exactly as Blobbi Standalone (44c4f32) adopts it, written out:
 * `buildEggTags(..., { visualGeneration: 'v3', v3 })` plus the incubation start.
 */
const STANDALONE_EGG_TAGS: string[][] = [
  ['d', 'blobbi-aaaaaaaaaaaa-00000000a7'], ['b', 'blobbi:ecosystem:v1'], ['name', 'Umber'], ['stage', 'egg'], ['state', 'active'],
  ['seed', '9a21032d420a965fbaf500061f1b250d82f8c2b74aa64c117d9e852188a6c30c'], ['generation', '1'], ['breeding_ready', 'false'],
  ['experience', '0'], ['care_streak', '1'], ['care_streak_last_at', '1757000000'], ['care_streak_last_day', '2026-10-05'],
  ['hunger', '100'], ['happiness', '100'], ['health', '100'], ['hygiene', '100'], ['energy', '100'],
  ['last_interaction', '1757000000'], ['last_decay_at', '1757000000'],
  ['base_color', '#2b3a67'], ['secondary_color', '#ffd23f'], ['eye_color', '#e85d75'], ['pattern', 'striped'], ['special_mark', 'moon'],
  ['visual_generation', 'v3'], ['visual_algorithm', '1'], ['accent_color', '#7ad3f4'],
  ['antenna', 'double'], ['horns', 'side'], ['ears', 'pointed'], ['tail', 'leaf'], ['belly', 'true'], ['freckles', 'true'],
  ['progression_state', 'incubating'], ['progression_started_at', '1757000000'],
];

const IDENTITY_TAGS = ['d', 'seed', VISUAL_GENERATION_TAG, ...BLOBBI_V3_TAG_NAMES];
const identityOf = (tags: readonly string[][]) => tags.filter((t) => IDENTITY_TAGS.includes(t[0])).map((t) => t.join('=')).sort();
const EXPECTED_IDENTITY = identityOf(STANDALONE_EGG_TAGS);

function eventWith(tags: string[][], at: number, content = '', kind = KIND_BLOBBI_STATE): NostrEvent {
  return { id: at.toString(16).padStart(64, '0'), pubkey: PUBKEY, created_at: at, kind, tags, content, sig: '0'.repeat(128) };
}
const reload = (event: NostrEvent): NostrEvent => JSON.parse(JSON.stringify(event));
function parse(event: NostrEvent): BlobbiCompanion {
  const companion = parseBlobbiEvent(reload(event));
  if (!companion || companion.isLegacy) throw new Error('must parse as a modern Blobbi');
  return companion;
}

/** Fails if one identity tag moved, or a V3 event gained what V3 does not have. */
function expectSameIndividual(event: NostrEvent, label: string) {
  expect(identityOf(event.tags), label).toEqual(EXPECTED_IDENTITY);
  for (const name of ['spots', 'size', 'adult_type']) expect(getTagValue(event.tags, name), `${label}: ${name}`).toBeUndefined();
  expect(getTagValue(event.tags, 'generation'), `${label}: generation`).toBe('1');
  const companion = parse(event);
  expect(companion.visualGeneration, label).toBe('v3');
  expect(companion.v3Identity, label).toEqual({ ...UNUSUAL, missing: [] });
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
  it('a Standalone egg parses with every identity field, explicit over the seed', () => {
    const egg = parse(eventWith(STANDALONE_EGG_TAGS, CREATED_AT));
    expect(egg.visualGeneration).toBe('v3');
    expect(egg.v3Identity).toEqual({ ...UNUSUAL, missing: [] });
    expect(egg.generation).toBe(1);
    expect(egg.adultType).toBeUndefined();
    // What Ditto colours its UI with is the stated identity, not the seed's.
    expect(egg.visualTraits.baseColor).toBe('#2b3a67');
    const own = createBlobbiV3Identity(SEED);
    expect(own.colors).not.toEqual(UNUSUAL.colors);
    expect(own.traits).not.toEqual(UNUSUAL.traits);
    // And the drawing is of the stated identity.
    const visual = getBlobbiVisualIdentity(egg);
    expect(visual.v3).toEqual({ seed: SEED, algorithm: 1, colors: UNUSUAL.colors, traits: UNUSUAL.traits });
    expect(resolveBlobbiV3Visual(visual.v3!).status).toBe('individual');
  });

  it('a seed in upper case is the same seed, read in lower case', () => {
    const upper = STANDALONE_EGG_TAGS.map((t) => (t[0] === 'seed' ? ['seed', SEED.toUpperCase()] : t));
    const companion = parse(eventWith(upper, CREATED_AT));
    expect(companion.v3Identity?.seed).toBe(SEED);
    expect(canonicalBlobbiV3Seed(SEED.toUpperCase())).toBe(SEED);
    const draw = (c: BlobbiCompanion) => renderBlobbiSvg({ ...getBlobbiVisualIdentity(c), instanceId: 'x' }).svg;
    expect(draw(companion)).toBe(draw(parse(eventWith(STANDALONE_EGG_TAGS, CREATED_AT))));
  });

  it('a value that is not a seed is reported missing and never repaired into another Blobbi', () => {
    const stated = getBlobbiVisualIdentity(parse(eventWith(STANDALONE_EGG_TAGS, CREATED_AT)));
    const noSeed = renderBlobbiSvg({ ...stated, v3: { ...stated.v3!, seed: undefined }, instanceId: 'x' }).svg;
    for (const bad of ['a text seed', SEED.slice(1), `0x${SEED.slice(2)}`, ` ${SEED}`, `${SEED}00`, 'g'.repeat(64)]) {
      const tags = STANDALONE_EGG_TAGS.map((t) => (t[0] === 'seed' ? ['seed', bad] : t));
      const event = eventWith(tags, CREATED_AT);
      const companion = parseBlobbiEvent(event);
      expect(companion?.v3Identity?.seed, bad).toBeUndefined();
      expect(companion?.v3Identity?.missing, bad).toContain('seed');
      const visual = getBlobbiVisualIdentity(companion!);
      expect(resolveBlobbiV3Visual({ ...visual.v3!, seed: bad }).status, bad).toBe('none');
      // Drawn as no seed at all, not as some individual hashed from the text.
      expect(renderBlobbiSvg({ ...visual, instanceId: 'x' }).svg, bad).toBe(noSeed);
      if (classifyBlobbiEvent(event) === 'legacy') continue; // never selected, so never republished
      // One the kit still reads as modern (64 characters, not hex) is
      // republished with its seed exactly as written: nothing repairs it.
      const republished = updateBlobbiTags(companion!.allTags, { state: 'sleeping' });
      expect(getTagValue(republished, 'seed'), bad).toBe(bad);
      expect(identityOf(republished), bad).toEqual(identityOf(tags));
    }
    expect(() => createBlobbiV3Identity('a text seed')).toThrow(TypeError);
  });

  it('every reference identity survives the tags and back', () => {
    for (const { name, identity } of V3_REFERENCE_BLOBBIS) {
      const tags = buildEggTags(PUBKEY, PET_ID, CREATED_AT, name, { visualGeneration: 'v3', v3: (seed) => ({ ...identity, seed }) })
        .map((t) => (t[0] === 'seed' ? ['seed', identity.seed] : t));
      const companion = parse(eventWith(tags, CREATED_AT));
      expect(companion.v3Identity, name).toEqual({ ...identity, missing: [] });
      for (const absent of ['spots', 'size', 'adult_type']) expect(getTagValue(tags, absent), `${name} ${absent}`).toBeUndefined();
    }
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

describe('V1 and V2 are unchanged', () => {
  it('Ditto still creates V1 eggs, by hand, with no V3 identity', () => {
    const preview = generateEggPreview(PUBKEY, 'Pip');
    const tags = previewToEventTags(preview);
    expect(getTagValue(tags, 'visual_generation')).toBeUndefined();
    for (const name of BLOBBI_V3_TAG_NAMES.filter((n) => !['base_color', 'secondary_color', 'eye_color', 'pattern', 'special_mark'].includes(n))) {
      expect(getTagValue(tags, name), name).toBeUndefined();
    }
    expect(getTagValue(tags, 'size')).toBeDefined();
    expect(parse(eventWith(tags, preview.createdAt)).visualGeneration).toBe('v1');
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
      // The seed is untouched; V1/V2 colour tags remain the seed's mirrors.
      expect(getTagValue(event.tags, 'seed')).toBe(getTagValue(egg.tags, 'seed'));
      expect(getTagValue(event.tags, 'base_color')).toBe(getTagValue(egg.tags, 'base_color'));
    }
  });
});
