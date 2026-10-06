import { describe, it, expect } from 'vitest';
import type { NostrEvent } from '@nostrify/nostrify';

import {
  KIND_BLOBBI_STATE,
  BLOBBI_ECOSYSTEM_NAMESPACE,
  getCanonicalBlobbiD,
  deriveBlobbiSeedV1,
  isLegacyBlobbiEvent,
} from '@blobbi-kit/core/blobbi';

import {
  isDisplayableInteropBlobbi,
  recoverInteropCompanions,
} from './interop-recovery';

const PUBKEY = 'a'.repeat(64);

/**
 * Build a kind 31124 event the way Blobbi Island does: valid Blobbi identity,
 * a NIP-89 `client` tag branded "blobbi", empty content, and NO Ditto-specific
 * mission/evolution JSON. blobbi-kit 0.4.0 misclassified this as legacy
 * because of the `client == "blobbi"` heuristic.
 */
function makeIslandEvent({
  petId = '3196847fb5',
  name = 'Brook',
  stage = 'baby',
  content = '',
  clientTag = ['client', 'blobbi'],
  extraTags = [],
  createdAt = 1_700_000_000,
}: {
  petId?: string;
  name?: string;
  stage?: 'egg' | 'baby' | 'adult';
  content?: string;
  clientTag?: string[] | null;
  extraTags?: string[][];
  createdAt?: number;
} = {}): NostrEvent {
  const d = getCanonicalBlobbiD(PUBKEY, petId);
  const seed = deriveBlobbiSeedV1(PUBKEY, d, createdAt);
  const tags: string[][] = [
    ['d', d],
    ['b', BLOBBI_ECOSYSTEM_NAMESPACE],
    ['stage', stage],
    ['state', 'active'],
    ['last_interaction', String(createdAt)],
    ['name', name],
    ['seed', seed],
    ...extraTags,
  ];
  if (clientTag) tags.push(clientTag);
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

describe('interop event classification', () => {
  // blobbi-kit 0.4.0 flagged these as legacy (the bug this module works
  // around). From 0.5 on, branding tags are not evidence either way, so the
  // kit reads them as modern and the recovery below has nothing to recover.
  it('blobbi-kit no longer flags an Island event with client=blobbi as legacy', () => {
    const event = makeIslandEvent();
    expect(isLegacyBlobbiEvent(event)).toBe(false);
  });

  it('nor one with a t=blobbi topic tag', () => {
    const event = makeIslandEvent({ clientTag: null, extraTags: [['t', 'blobbi']] });
    expect(isLegacyBlobbiEvent(event)).toBe(false);
  });
});

describe('isDisplayableInteropBlobbi', () => {
  it('reads a V3 seed by the V3 rule: never resurrects a V3 event whose seed is not one; V1 keeps the length check', () => {
    const withSeed = (event: NostrEvent, seed: string, generation?: string) => ({
      ...event,
      tags: [...event.tags.map((t) => (t[0] === 'seed' ? ['seed', seed] : t)), ...(generation ? [['visual_generation', generation]] : [])],
    });
    const base = makeIslandEvent();
    const seed = base.tags.find((t) => t[0] === 'seed')![1];
    // A V3 seed, in either case: displayable.
    expect(isDisplayableInteropBlobbi(withSeed(base, seed, 'v3'))).toBe(true);
    expect(isDisplayableInteropBlobbi(withSeed(base, seed.toUpperCase(), 'v3'))).toBe(true);
    // 64 characters that are not hexadecimal, a wrong length, text: not a V3 seed, not displayable, as the kit says.
    for (const bad of ['x'.repeat(64), seed.slice(1), 'a text seed']) {
      expect(isDisplayableInteropBlobbi(withSeed(base, bad, 'v3')), bad).toBe(false);
      expect(isLegacyBlobbiEvent(withSeed(base, bad, 'v3')), bad).toBe(true);
    }
    // V1 and V2: as before, any 64 characters.
    expect(isDisplayableInteropBlobbi(withSeed(base, 'x'.repeat(64)))).toBe(true);
    expect(isDisplayableInteropBlobbi(withSeed(base, 'x'.repeat(64), 'v2'))).toBe(true);
    expect(isDisplayableInteropBlobbi(withSeed(base, seed.slice(1), 'v2'))).toBe(false);
  });

  it('recovers an Island baby flagged legacy only by the client=blobbi heuristic', () => {
    const event = makeIslandEvent();
    expect(isDisplayableInteropBlobbi(event)).toBe(true);
  });

  it('recovers when the legacy flag comes from a t=blobbi tag', () => {
    const event = makeIslandEvent({ clientTag: null, extraTags: [['t', 'blobbi']] });
    expect(isDisplayableInteropBlobbi(event)).toBe(true);
  });

  it('recovers a baby with empty content and no Ditto mission JSON', () => {
    const event = makeIslandEvent({ content: '' });
    expect(isDisplayableInteropBlobbi(event)).toBe(true);
  });

  it('does NOT recover a genuine old-app event (old-app schema tag)', () => {
    const event = makeIslandEvent({ extraTags: [['incubation_time', '3600']] });
    expect(isDisplayableInteropBlobbi(event)).toBe(false);
  });

  it('does NOT recover an event with a non-canonical d tag', () => {
    const event = makeIslandEvent();
    event.tags = event.tags.map((t) => (t[0] === 'd' ? ['d', 'not-a-canonical-d'] : t));
    expect(isDisplayableInteropBlobbi(event)).toBe(false);
  });

  it('does NOT recover an event missing a seed', () => {
    const event = makeIslandEvent();
    event.tags = event.tags.filter(([n]) => n !== 'seed');
    expect(isDisplayableInteropBlobbi(event)).toBe(false);
  });

  it('does NOT recover an event missing the b namespace (fails isValidBlobbiEvent)', () => {
    const event = makeIslandEvent();
    event.tags = event.tags.filter(([n]) => n !== 'b');
    expect(isDisplayableInteropBlobbi(event)).toBe(false);
  });
});

describe('recoverInteropCompanions', () => {
  it('turns a dropped Island baby into a displayable, non-legacy companion', () => {
    const companions = recoverInteropCompanions([makeIslandEvent()]);
    expect(companions).toHaveLength(1);
    expect(companions[0].stage).toBe('baby');
    expect(companions[0].name).toBe('Brook');
    // Flag cleared so downstream care actions don't no-op on it.
    expect(companions[0].isLegacy).toBe(false);
    expect(companions[0].d).toBe(getCanonicalBlobbiD(PUBKEY, '3196847fb5'));
  });

  it('excludes genuine old-app events from recovery', () => {
    const island = makeIslandEvent({ petId: '1111111111' });
    const oldApp = makeIslandEvent({
      petId: '2222222222',
      extraTags: [['egg_temperature', '37']],
    });
    const companions = recoverInteropCompanions([island, oldApp]);
    expect(companions).toHaveLength(1);
    expect(companions[0].d).toBe(getCanonicalBlobbiD(PUBKEY, '1111111111'));
  });

  it('keeps the newest event per d-tag', () => {
    const older = makeIslandEvent({ name: 'Old', createdAt: 1_700_000_000 });
    const newer = makeIslandEvent({ name: 'New', createdAt: 1_700_000_500 });
    const companions = recoverInteropCompanions([older, newer]);
    expect(companions).toHaveLength(1);
    expect(companions[0].name).toBe('New');
  });

  it('resolves a profile current_companion pointing at an Island Blobbi', () => {
    const island = makeIslandEvent({ petId: '3196847fb5' });
    const companions = recoverInteropCompanions([island]);
    const currentCompanionD = getCanonicalBlobbiD(PUBKEY, '3196847fb5');
    const match = companions.find((c) => c.d === currentCompanionD);
    expect(match).toBeDefined();
    expect(match?.name).toBe('Brook');
  });

  it('returns nothing when there are no displayable events', () => {
    const oldApp = makeIslandEvent({ extraTags: [['fees', '100']] });
    expect(recoverInteropCompanions([oldApp])).toEqual([]);
  });
});
