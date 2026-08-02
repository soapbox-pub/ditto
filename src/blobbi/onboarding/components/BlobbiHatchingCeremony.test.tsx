import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import type { NostrEvent } from '@nostrify/nostrify';

import {
  KIND_BLOBBI_STATE,
  KIND_BLOBBONAUT_PROFILE,
  buildBlobbonautTags,
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

function renderCeremony(profile: BlobbonautProfile | null, updateProfileEvent = vi.fn()) {
  const utils = render(
    <BlobbiHatchingCeremony
      profile={profile}
      updateProfileEvent={updateProfileEvent}
      updateCompanionEvent={vi.fn()}
      invalidateProfile={vi.fn()}
      invalidateCompanion={vi.fn()}
      setStoredSelectedD={vi.fn()}
    />,
  );
  return { ...utils, updateProfileEvent };
}

const profilePublishes = () => published.filter((p) => p.kind === KIND_BLOBBONAUT_PROFILE);
const hasCoinsTag = (tags: string[][]) => tags.some(([k]) => k === 'coins');

beforeEach(() => {
  query.mockReset();
  toastMock.mockReset();
  published.length = 0;
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
