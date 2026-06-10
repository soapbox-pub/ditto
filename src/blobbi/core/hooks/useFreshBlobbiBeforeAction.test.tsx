import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { NostrEvent } from '@nostrify/nostrify';

import {
  KIND_BLOBBI_STATE,
  KIND_BLOBBONAUT_PROFILE,
  BLOBBI_ECOSYSTEM_NAMESPACE,
  buildEggTags,
  parseBlobbiEvent,
  parseBlobbonautEvent,
  getCanonicalBlobbiD,
  type BlobbiCompanion,
  type BlobbonautProfile,
} from '../lib/blobbi';
import { useFreshBlobbiBeforeAction } from './useFreshBlobbiBeforeAction';

// ─── Mocks ─────────────────────────────────────────────────────────────────
// Control the relay response per-test.
const query = vi.fn<(...args: unknown[]) => Promise<NostrEvent[]>>();
vi.mock('@nostrify/react', () => ({
  useNostr: () => ({ nostr: { query } }),
}));

const PUBKEY = 'a'.repeat(64);
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: { pubkey: PUBKEY } }),
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────
const PET_ID = '0123456789';
const CREATED_AT = 1_700_000_000;

/** A fully-formed canonical Kind 31124 Blobbi event (egg stage). */
function makeCanonicalEvent(overrides: Partial<NostrEvent> = {}): NostrEvent {
  return {
    id: 'f'.repeat(64),
    pubkey: PUBKEY,
    created_at: CREATED_AT,
    kind: KIND_BLOBBI_STATE,
    tags: buildEggTags(PUBKEY, PET_ID, CREATED_AT, 'Sparky'),
    content: '',
    sig: '0'.repeat(128),
    ...overrides,
  };
}

/**
 * An old-app legacy Kind 31124 event: non-canonical d-tag, no seed, no name.
 * Shares the SAME d-tag as the canonical fixture is NOT possible (different
 * d-tag), so a legacy event always has its own legacy d.
 */
function makeLegacyEvent(overrides: Partial<NostrEvent> = {}): NostrEvent {
  const tags = buildEggTags(PUBKEY, PET_ID, CREATED_AT, 'Puck')
    .filter(([name]) => name !== 'seed' && name !== 'name')
    .map((t) => (t[0] === 'd' ? ['d', 'blobbi-puck'] : t));
  return {
    id: 'e'.repeat(64),
    pubkey: PUBKEY,
    created_at: CREATED_AT,
    kind: KIND_BLOBBI_STATE,
    tags,
    content: '',
    sig: '0'.repeat(128),
    ...overrides,
  };
}

function makeCompanion(event: NostrEvent): BlobbiCompanion {
  const parsed = parseBlobbiEvent(event);
  if (!parsed) throw new Error('fixture did not parse');
  return parsed;
}

/** Minimal canonical Blobbonaut profile (kind 11125). */
function makeProfile(): BlobbonautProfile {
  const event: NostrEvent = {
    id: 'b'.repeat(64),
    pubkey: PUBKEY,
    created_at: CREATED_AT,
    kind: KIND_BLOBBONAUT_PROFILE,
    tags: [
      ['d', `blobbonaut-${PUBKEY.slice(0, 12)}`],
      ['b', BLOBBI_ECOSYSTEM_NAMESPACE],
    ],
    content: '',
    sig: '0'.repeat(128),
  };
  const parsed = parseBlobbonautEvent(event);
  if (!parsed) throw new Error('profile fixture did not parse');
  return parsed;
}

const noop = () => {};

describe('useFreshBlobbiBeforeAction — legacy companion never reaches publish path', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('isLegacy is correctly true for an old-app legacy event, false for canonical', () => {
    expect(makeCompanion(makeLegacyEvent()).isLegacy).toBe(true);
    expect(makeCompanion(makeCanonicalEvent()).isLegacy).toBe(false);
  });

  it('returns null immediately for a legacy cached companion (no relay fetch, no fallback)', async () => {
    const { result } = renderHook(() => useFreshBlobbiBeforeAction());

    const out = await result.current.fetchFreshBlobbiBeforeAction({
      companion: makeCompanion(makeLegacyEvent()),
      profile: makeProfile(),
      updateProfileEvent: noop,
      updateCompanionEvent: noop,
    });

    expect(out).toBeNull();
    // Bailed before touching relays — never queries.
    expect(query).not.toHaveBeenCalled();
  });

  it('does NOT fall back to a cached companion that is legacy even if relays return legacy events', async () => {
    // Relay returns only legacy events; fresh fetch filters them → null.
    query.mockResolvedValue([makeLegacyEvent()]);

    const { result } = renderHook(() => useFreshBlobbiBeforeAction());

    const out = await result.current.fetchFreshBlobbiBeforeAction({
      companion: makeCompanion(makeLegacyEvent()),
      profile: makeProfile(),
      updateProfileEvent: noop,
      updateCompanionEvent: noop,
    });

    expect(out).toBeNull();
  });

  it('falls back to a CANONICAL cached companion on a transient relay miss', async () => {
    // Relay returns nothing for the companion fetch AND the profile fetch.
    query.mockResolvedValue([]);

    const cached = makeCompanion(makeCanonicalEvent());
    const profile = makeProfile();
    const { result } = renderHook(() => useFreshBlobbiBeforeAction());

    const out = await result.current.fetchFreshBlobbiBeforeAction({
      companion: cached,
      profile,
      updateProfileEvent: noop,
      updateCompanionEvent: noop,
    });

    expect(out).not.toBeNull();
    expect(out!.companion.d).toBe(getCanonicalBlobbiD(PUBKEY, PET_ID));
    expect(out!.companion.isLegacy).toBe(false);
  });

  it('uses the fresh canonical event when relays return one', async () => {
    const freshEvent = makeCanonicalEvent({ created_at: CREATED_AT + 100 });
    // First query (companion) returns the canonical event; profile query returns
    // the same kind set — return the canonical companion for both calls.
    query.mockImplementation((filters: unknown) => {
      const f = (filters as Array<{ kinds: number[] }>)[0];
      if (f.kinds.includes(KIND_BLOBBI_STATE)) return Promise.resolve([freshEvent]);
      return Promise.resolve([]); // profile miss → falls back to cached profile
    });

    const cached = makeCompanion(makeCanonicalEvent());
    const { result } = renderHook(() => useFreshBlobbiBeforeAction());

    const out = await result.current.fetchFreshBlobbiBeforeAction({
      companion: cached,
      profile: makeProfile(),
      updateProfileEvent: noop,
      updateCompanionEvent: noop,
    });

    expect(out).not.toBeNull();
    expect(out!.companion.event.created_at).toBe(CREATED_AT + 100);
    expect(out!.companion.isLegacy).toBe(false);
  });
});
