import { describe, it, expect, vi } from 'vitest';
import type { NostrEvent, NostrFilter, NPool } from '@nostrify/nostrify';

import {
  KIND_BLOBBI_STATE,
  BLOBBI_ECOSYSTEM_NAMESPACE,
  getCanonicalBlobbiD,
  deriveBlobbiSeedV1,
} from '@blobbi-kit/core/blobbi';

import { preflightBlobbiOwnership, isOwnedBlobbiStateEvent } from './preflight-ownership';

const PUBKEY = 'a'.repeat(64);

/**
 * Build a kind 31124 event the way Blobbi Island would: only the tags needed to
 * be a Blobbi, empty content, no Ditto-specific mission/evolution JSON.
 */
function makeBlobbiEvent(
  stage: 'egg' | 'baby' | 'adult',
  {
    petId = '0123456789',
    content = '',
    includeB = true,
    extraTags = [],
    createdAt = 1_700_000_000,
  }: {
    petId?: string;
    content?: string;
    includeB?: boolean;
    extraTags?: string[][];
    createdAt?: number;
  } = {},
): NostrEvent {
  const d = getCanonicalBlobbiD(PUBKEY, petId);
  const seed = deriveBlobbiSeedV1(PUBKEY, d, createdAt);
  const tags: string[][] = [
    ['d', d],
    ['stage', stage],
    ['state', 'active'],
    ['last_interaction', String(createdAt)],
    ['name', stage === 'egg' ? 'Egg' : 'Islander'],
    ['seed', seed],
    ...extraTags,
  ];
  if (includeB) tags.push(['b', BLOBBI_ECOSYSTEM_NAMESPACE]);
  return {
    id: 'e'.repeat(64),
    pubkey: PUBKEY,
    created_at: createdAt,
    kind: KIND_BLOBBI_STATE,
    content,
    sig: 'f'.repeat(128),
    tags,
  };
}

/** Minimal fake NPool that returns a fixed set of events from `query`. */
function makeNostr(events: NostrEvent[], opts: { throwOnQuery?: boolean } = {}): {
  nostr: NPool;
  query: ReturnType<typeof vi.fn>;
} {
  const query = vi.fn(async (_filters: NostrFilter[]) => {
    if (opts.throwOnQuery) throw new Error('relay unavailable');
    return events;
  });
  return { nostr: { query } as unknown as NPool, query };
}

describe('isOwnedBlobbiStateEvent', () => {
  it('accepts an Island-created baby with empty content and no b tag', () => {
    const event = makeBlobbiEvent('baby', { content: '', includeB: false });
    expect(isOwnedBlobbiStateEvent(event)).toBe(true);
  });

  it('accepts an egg', () => {
    expect(isOwnedBlobbiStateEvent(makeBlobbiEvent('egg'))).toBe(true);
  });

  it('rejects a non-31124 event', () => {
    const event = { ...makeBlobbiEvent('baby'), kind: 1 };
    expect(isOwnedBlobbiStateEvent(event)).toBe(false);
  });

  it('rejects an event missing a d tag', () => {
    const event = makeBlobbiEvent('baby');
    event.tags = event.tags.filter(([n]) => n !== 'd');
    expect(isOwnedBlobbiStateEvent(event)).toBe(false);
  });

  it('rejects an event with an unknown stage', () => {
    const event = makeBlobbiEvent('baby');
    event.tags = event.tags.map((t) => (t[0] === 'stage' ? ['stage', 'ancient'] : t));
    expect(isOwnedBlobbiStateEvent(event)).toBe(false);
  });
});

describe('preflightBlobbiOwnership', () => {
  it('reports no Blobbi when relays return nothing (hatch allowed)', async () => {
    const { nostr } = makeNostr([]);
    const result = await preflightBlobbiOwnership(nostr, PUBKEY);
    expect(result.hasBlobbi).toBe(false);
    expect(result.ownedCount).toBe(0);
  });

  it('queries WITHOUT the #b ecosystem filter so Island events cannot be missed', async () => {
    const { nostr, query } = makeNostr([makeBlobbiEvent('baby', { includeB: false })]);
    await preflightBlobbiOwnership(nostr, PUBKEY);
    const filters = query.mock.calls[0][0] as NostrFilter[];
    expect(filters).toHaveLength(1);
    expect(filters[0].kinds).toEqual([KIND_BLOBBI_STATE]);
    expect(filters[0].authors).toEqual([PUBKEY]);
    // No #b filter — this is the whole point of the robust guard.
    expect('#b' in filters[0]).toBe(false);
  });

  it('detects an Island-created baby with empty content and no b tag', async () => {
    const island = makeBlobbiEvent('baby', { content: '', includeB: false });
    const { nostr } = makeNostr([island]);
    const result = await preflightBlobbiOwnership(nostr, PUBKEY);
    expect(result.hasBlobbi).toBe(true);
    expect(result.ownedCount).toBe(1);
    // Even without the `b` tag, parseBlobbiEvent may reject it — but ownership
    // is still reported so we never mint a duplicate.
  });

  it('detects and returns a parseable Island baby (with b tag) for reuse', async () => {
    const island = makeBlobbiEvent('baby', { content: '', includeB: true });
    const { nostr } = makeNostr([island]);
    const result = await preflightBlobbiOwnership(nostr, PUBKEY);
    expect(result.hasBlobbi).toBe(true);
    expect(result.existing).toBeDefined();
    expect(result.existing?.stage).toBe('baby');
  });

  it('prefers a hatched Blobbi over an egg when both exist', async () => {
    const egg = makeBlobbiEvent('egg', { petId: '1111111111' });
    const baby = makeBlobbiEvent('baby', { petId: '2222222222' });
    const { nostr } = makeNostr([egg, baby]);
    const result = await preflightBlobbiOwnership(nostr, PUBKEY);
    expect(result.hasBlobbi).toBe(true);
    expect(result.existing?.stage).toBe('baby');
  });

  it('reports ownership even when profile is missing (guard is profile-independent)', async () => {
    // The helper never reads a profile — it only queries kind 31124 by author.
    const baby = makeBlobbiEvent('baby', { content: '' });
    const { nostr } = makeNostr([baby]);
    const result = await preflightBlobbiOwnership(nostr, PUBKEY);
    expect(result.hasBlobbi).toBe(true);
  });

  it('fails safe (no ownership) when the query throws, so normal flow continues', async () => {
    const { nostr } = makeNostr([], { throwOnQuery: true });
    const result = await preflightBlobbiOwnership(nostr, PUBKEY);
    expect(result.hasBlobbi).toBe(false);
  });

  it('returns no ownership for an empty pubkey', async () => {
    const { nostr, query } = makeNostr([makeBlobbiEvent('baby')]);
    const result = await preflightBlobbiOwnership(nostr, '');
    expect(result.hasBlobbi).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });
});
