import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import type { NostrEvent } from '@nostrify/nostrify';

import {
  KIND_BLOBBI_STATE,
  KIND_BLOBBONAUT_PROFILE,
  buildBlobbonautTags,
  buildEggTags,
  parseBlobbonautEvent,
  type BlobbonautProfile,
} from '@blobbi-kit/core/blobbi';

import { BlobbiHatchingCeremony } from './BlobbiHatchingCeremony';

/**
 * Regression tests for the ceremony's silent setup step:
 *
 *  - a brand-new profile is created WITHOUT a coins tag (currency belongs to
 *    Blobbi Island, not Ditto);
 *  - a transient cache miss (null profile prop) is NOT treated as proof of
 *    absence — a fresh relay read must discover an existing profile and the
 *    ceremony must merge into it instead of clobbering it;
 *  - relay read failure publishes nothing;
 *  - unsorted relay responses resolve to the newest valid profile event.
 */

// ─── Mocks ───────────────────────────────────────────────────────────────────

let currentPubkey = 'a'.repeat(64);

const { query, mutateAsync, published, toastMock } = vi.hoisted(() => {
  type PublishTemplate = {
    kind: number;
    content: string;
    tags: string[][];
    created_at?: number;
    prev?: NostrEvent;
  };
  const published: PublishTemplate[] = [];
  return {
    query: vi.fn<(...args: unknown[]) => Promise<NostrEvent[]>>(),
    published,
    mutateAsync: vi.fn(async (t: PublishTemplate): Promise<NostrEvent> => {
      published.push(t);
      return {
        id: String(published.length).padStart(64, '0'),
        pubkey: '',
        created_at: t.created_at ?? Math.floor(Date.now() / 1000),
        kind: t.kind,
        tags: t.tags,
        content: t.content,
        sig: '0'.repeat(128),
      };
    }),
    toastMock: vi.fn(),
  };
});

vi.mock('@nostrify/react', () => ({
  useNostr: () => ({ nostr: { query } }),
}));
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: { pubkey: currentPubkey } }),
}));
vi.mock('@/hooks/useAuthor', () => ({
  useAuthor: () => ({ data: { metadata: { name: 'Tester' } } }),
}));
vi.mock('@/hooks/useNostrPublish', () => ({
  useNostrPublish: () => ({ mutateAsync }),
}));
vi.mock('@/hooks/useToast', () => ({
  toast: toastMock,
  useToast: () => ({ toast: toastMock }),
}));
vi.mock('@/lib/haptics', () => ({
  impactLight: vi.fn(),
  impactMedium: vi.fn(),
  impactHeavy: vi.fn(),
  notificationSuccess: vi.fn(),
}));
vi.mock('@/blobbi/ui/BlobbiStageVisual', () => ({
  BlobbiStageVisual: () => null,
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

const CREATED_AT = 1_700_000_000;

function makeProfileEvent(
  pubkey: string,
  extraTags: string[][],
  overrides: Partial<NostrEvent> = {},
): NostrEvent {
  return {
    id: 'e'.repeat(63) + (overrides.id ?? 'e'),
    pubkey,
    created_at: CREATED_AT,
    kind: KIND_BLOBBONAUT_PROFILE,
    tags: [...buildBlobbonautTags(pubkey), ...extraTags],
    content: '',
    sig: '0'.repeat(128),
    ...overrides,
  };
}

type CeremonyProps = Parameters<typeof BlobbiHatchingCeremony>[0];

function renderCeremony(
  profile: BlobbonautProfile | null,
  updateProfileEvent = vi.fn(),
  extraProps: Partial<CeremonyProps> = {},
) {
  const utils = render(
    <BlobbiHatchingCeremony
      profile={profile}
      updateProfileEvent={updateProfileEvent}
      updateCompanionEvent={vi.fn()}
      invalidateProfile={vi.fn()}
      invalidateCompanion={vi.fn()}
      setStoredSelectedD={vi.fn()}
      {...extraProps}
    />,
  );
  return { ...utils, updateProfileEvent };
}

const profilePublishes = () => published.filter((p) => p.kind === KIND_BLOBBONAUT_PROFILE);
const hasCoinsTag = (tags: string[][]) => tags.some(([k]) => k === 'coins');

/**
 * Every relay read the ceremony performs, in call order, together with how many
 * events had already been published when it was issued. Lets a test assert both
 * the order of the two guards and that neither writes before both have read.
 */
const queryLog: Array<{ kinds: number[]; publishesSoFar: number }> = [];

/**
 * Route each relay query to the right fixture by the kinds it asks for: the
 * ownership preflight asks for kind 31124, the profile read asks for the
 * Blobbonaut profile kinds. A single blanket `mockResolvedValue` cannot tell
 * the two guards apart.
 */
function routeQueries(fixtures: { blobbis?: NostrEvent[]; profiles?: NostrEvent[] }) {
  query.mockImplementation(async (...args: unknown[]) => {
    const [filter] = (args[0] ?? []) as Array<{ kinds?: number[] }>;
    const kinds = filter?.kinds ?? [];
    queryLog.push({ kinds, publishesSoFar: published.length });
    return kinds.includes(KIND_BLOBBI_STATE) ? (fixtures.blobbis ?? []) : (fixtures.profiles ?? []);
  });
}

/** A fully-formed kind 31124 Blobbi the user already owns (e.g. from Island). */
function makeOwnedBlobbi(pubkey: string, petId = 'island-pet'): NostrEvent {
  return {
    id: 'b'.repeat(64),
    pubkey,
    created_at: CREATED_AT,
    kind: KIND_BLOBBI_STATE,
    tags: buildEggTags(pubkey, petId, CREATED_AT, 'Sparky'),
    content: '',
    sig: '0'.repeat(128),
  };
}

beforeEach(() => {
  query.mockReset();
  toastMock.mockReset();
  published.length = 0;
  queryLog.length = 0;
  mutateAsync.mockClear();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('BlobbiHatchingCeremony silent setup', () => {
  it('creates a brand-new profile with NO coins tag when relays confirm absence', async () => {
    currentPubkey = 'a'.repeat(64);
    query.mockResolvedValue([]); // authoritative read: nothing on relays

    renderCeremony(null);

    // profile create → egg publish → has[] update
    await waitFor(() => expect(published.length).toBe(3), { timeout: 4000 });

    const [profileCreate, egg, hasUpdate] = published;
    expect(profileCreate.kind).toBe(KIND_BLOBBONAUT_PROFILE);
    expect(hasCoinsTag(profileCreate.tags)).toBe(false);
    expect(profileCreate.tags).toContainEqual(['name', 'Tester']);
    expect(profileCreate.tags.some(([k]) => k === 'd')).toBe(true);
    expect(profileCreate.tags.some(([k]) => k === 'b')).toBe(true);

    expect(egg.kind).toBe(KIND_BLOBBI_STATE);
    const eggD = egg.tags.find(([k]) => k === 'd')?.[1];
    expect(eggD).toBeTruthy();

    expect(hasUpdate.kind).toBe(KIND_BLOBBONAUT_PROFILE);
    expect(hasUpdate.tags.filter(([k, v]) => k === 'has' && v === eggD).length).toBe(1);

    // Repeated execution of the whole flow never introduces a coins tag.
    for (const p of published) {
      expect(hasCoinsTag(p.tags)).toBe(false);
    }
  });

  it('treats a cache miss as untrusted: discovers the relay profile and merges instead of clobbering', async () => {
    currentPubkey = 'b'.repeat(64);
    const existing = makeProfileEvent(currentPubkey, [
      ['name', 'Keeper'],
      ['coins', '137'], // legacy tag: preserved opaquely, never rewritten
      // Dangling reference: no kind:31124 event backs 'pet-old' on the relays,
      // so the ownership preflight reports no owned Blobbi and the first egg is
      // still minted. This is recovery, not duplicate creation.
      ['has', 'pet-old'],
      ['current_companion', 'pet-old'],
      ['x-ditto-ext', 'keepme'], // unknown tag must survive
    ], { content: '{"room_layouts":{"v":1}}' });
    query.mockResolvedValue([existing]);

    const { updateProfileEvent } = renderCeremony(null);

    // egg publish + has[] merge — and NO fresh base-profile publish
    await waitFor(() => expect(published.length).toBe(2), { timeout: 4000 });

    expect(profilePublishes().length).toBe(1);
    const merge = profilePublishes()[0];

    // Merged on top of the discovered event, not a fabricated empty base.
    expect(merge.prev?.id).toBe(existing.id);
    expect(merge.content).toBe(existing.content);

    // Additive has[]: old entry kept, new egg added exactly once.
    const eggD = published.find((p) => p.kind === KIND_BLOBBI_STATE)!.tags.find(([k]) => k === 'd')?.[1];
    const hasValues = merge.tags.filter(([k]) => k === 'has').map(([, v]) => v);
    expect(hasValues).toContain('pet-old');
    expect(hasValues.filter((v) => v === eggD).length).toBe(1);

    // Legacy coins preserved verbatim; unknown tags and companion survive.
    expect(merge.tags).toContainEqual(['coins', '137']);
    expect(merge.tags).toContainEqual(['x-ditto-ext', 'keepme']);
    expect(merge.tags).toContainEqual(['current_companion', 'pet-old']);
    expect(merge.tags).toContainEqual(['name', 'Keeper']);

    // The discovered profile was synced back into the cache.
    expect(updateProfileEvent.mock.calls[0][0].id).toBe(existing.id);
  });

  it('selects the newest valid profile from an unsorted relay response', async () => {
    currentPubkey = 'c'.repeat(64);
    const older = makeProfileEvent(currentPubkey, [
      ['name', 'Old'],
      ['has', 'pet-old-only'],
    ], { id: '1'.repeat(64), created_at: CREATED_AT });
    const newer = makeProfileEvent(currentPubkey, [
      ['name', 'New'],
      ['has', 'pet-new'],
      ['x-marker', 'newest'],
    ], { id: '2'.repeat(64), created_at: CREATED_AT + 500 });
    // Older event deliberately first: selection must sort, not take head.
    query.mockResolvedValue([older, newer]);

    renderCeremony(null);

    await waitFor(() => expect(published.length).toBe(2), { timeout: 4000 });

    const merge = profilePublishes()[0];
    expect(merge.prev?.id).toBe(newer.id);
    expect(merge.tags).toContainEqual(['x-marker', 'newest']);
    expect(merge.tags).toContainEqual(['name', 'New']);
    expect(merge.tags.some(([k, v]) => k === 'has' && v === 'pet-new')).toBe(true);
    expect(merge.tags.some(([, v]) => v === 'pet-old-only')).toBe(false);
  });

  it('publishes NOTHING when the authoritative profile read fails', async () => {
    currentPubkey = 'd'.repeat(64);
    query.mockRejectedValue(new Error('relays unreachable'));

    renderCeremony(null);

    // Failure is surfaced to the user instead of fabricating an empty profile.
    await waitFor(() => expect(toastMock).toHaveBeenCalled(), { timeout: 4000 });
    expect(published.length).toBe(0);
  });

  it('reuses a cached profile passed as a prop without creating a base profile', async () => {
    currentPubkey = 'f'.repeat(64);
    const existing = makeProfileEvent(currentPubkey, [
      ['name', 'Keeper'],
      // Dangling has entry again — nothing on relays backs it, so the ownership
      // preflight does not veto minting the first egg.
      ['has', 'pet-old'],
    ]);
    const profile = parseBlobbonautEvent(existing);
    if (!profile) throw new Error('profile fixture did not parse');
    query.mockResolvedValue([existing]); // fresh read before the has[] merge

    renderCeremony(profile);

    await waitFor(() => expect(published.length).toBe(2), { timeout: 4000 });

    expect(profilePublishes().length).toBe(1);
    const merge = profilePublishes()[0];
    expect(merge.prev?.id).toBe(existing.id);
    const hasValues = merge.tags.filter(([k]) => k === 'has').map(([, v]) => v);
    expect(hasValues).toContain('pet-old');
    expect(hasValues.length).toBe(2); // old + newly created egg, nothing dropped
    expect(hasCoinsTag(merge.tags)).toBe(false);
  });
});

// ─── Guard coexistence ───────────────────────────────────────────────────────

/**
 * Two independent guards protect the silent setup path, and they were written
 * on separate branches that had to be merged by hand:
 *
 *  1. `preflightBlobbiOwnership` (kind 31124) — never mint a SECOND Blobbi for
 *     a user who already owns one (e.g. one created by Blobbi Island);
 *  2. `fetchFreshBlobbonautProfile` (kind 11125) — never publish a fresh base
 *     PROFILE over an existing one just because the query cache read null.
 *
 * They ask different questions about different events, so both must run, in
 * that order, and neither may swallow the other. These tests pin that contract
 * so a future merge or refactor cannot quietly drop one of them.
 */
describe('BlobbiHatchingCeremony guard coexistence', () => {
  it('runs the ownership preflight first, then the profile read, before publishing anything', async () => {
    currentPubkey = '1'.repeat(64);
    routeQueries({ blobbis: [], profiles: [] }); // nothing owned, no profile yet

    renderCeremony(null);

    // profile create → egg publish → has[] update
    await waitFor(() => expect(published.length).toBe(3), { timeout: 4000 });

    const preflightAt = queryLog.findIndex((q) => q.kinds.includes(KIND_BLOBBI_STATE));
    const profileReadAt = queryLog.findIndex((q) => q.kinds.includes(KIND_BLOBBONAUT_PROFILE));

    // Both guards ran...
    expect(preflightAt).toBeGreaterThanOrEqual(0);
    expect(profileReadAt).toBeGreaterThanOrEqual(0);
    // ...the ownership check went first...
    expect(preflightAt).toBeLessThan(profileReadAt);
    // ...and neither observed a write, so nothing was published before both
    // had a chance to veto it.
    expect(queryLog[preflightAt].publishesSoFar).toBe(0);
    expect(queryLog[profileReadAt].publishesSoFar).toBe(0);
  });

  it('aborts on the ownership preflight without reading or rewriting the profile', async () => {
    currentPubkey = '2'.repeat(64);
    const owned = makeOwnedBlobbi(currentPubkey);
    const ownedD = owned.tags.find(([k]) => k === 'd')?.[1];
    expect(ownedD).toBeTruthy();

    // A profile also exists on relays — the preflight must return before the
    // profile guard ever needs to look at it.
    routeQueries({
      blobbis: [owned],
      profiles: [makeProfileEvent(currentPubkey, [['name', 'Keeper'], ['has', 'pet-old']])],
    });

    const onExistingBlobbiFound = vi.fn();
    const setStoredSelectedD = vi.fn();
    renderCeremony(null, undefined, { onExistingBlobbiFound, setStoredSelectedD });

    await waitFor(() => expect(onExistingBlobbiFound).toHaveBeenCalledTimes(1), { timeout: 4000 });

    // Nothing at all was written: no duplicate egg, no profile republish.
    expect(published).toEqual([]);
    // The profile read never even happened — the preflight short-circuits it.
    expect(queryLog.some((q) => q.kinds.includes(KIND_BLOBBONAUT_PROFILE))).toBe(false);
    // The existing Blobbi was selected for reuse instead.
    expect(setStoredSelectedD).toHaveBeenCalledWith(ownedD);
  });

  it('skips the preflight for a deliberate adoption but still refuses to clobber the profile', async () => {
    currentPubkey = '3'.repeat(64);
    const existing = makeProfileEvent(currentPubkey, [
      ['name', 'Keeper'],
      ['coins', '137'], // legacy tag: preserved opaquely, never rewritten
      ['has', 'pet-old'],
      ['x-ditto-ext', 'keepme'],
    ]);
    // The user already owns a Blobbi AND has a profile — but asked for this one.
    routeQueries({ blobbis: [makeOwnedBlobbi(currentPubkey)], profiles: [existing] });

    renderCeremony(null, undefined, { userInitiated: true });

    // egg publish + has[] merge — and NO fresh base-profile publish
    await waitFor(() => expect(published.length).toBe(2), { timeout: 4000 });

    // Guard 1 is correctly bypassed: owning a Blobbi must never veto a user who
    // explicitly asked to adopt another, so the ownership query is never issued
    // and an egg IS minted.
    expect(queryLog.some((q) => q.kinds.includes(KIND_BLOBBI_STATE))).toBe(false);
    expect(published.some((p) => p.kind === KIND_BLOBBI_STATE)).toBe(true);

    // Guard 2 is still fully active: the profile is merged onto the discovered
    // event rather than replaced, legacy coins and unknown tags survive, and no
    // coins tag is authored.
    expect(profilePublishes().length).toBe(1);
    const merge = profilePublishes()[0];
    expect(merge.prev?.id).toBe(existing.id);
    expect(merge.tags).toContainEqual(['coins', '137']);
    expect(merge.tags).toContainEqual(['x-ditto-ext', 'keepme']);
    expect(merge.tags).toContainEqual(['name', 'Keeper']);
    expect(merge.tags.filter(([k]) => k === 'has').map(([, v]) => v)).toContain('pet-old');
  });
});
