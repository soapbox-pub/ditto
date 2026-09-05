/**
 * Legacy compatibility against the canonical domain kit.
 *
 * Ditto used to carry a host-side "interop recovery" for Blobbi Island events:
 * the shared legacy predicate treated the NIP-89 `client == "blobbi"` (and
 * `t == "blobbi"`) branding as proof of the old, unsupported app, so every
 * canonical Island-created Blobbi was dropped from the collection and Ditto
 * re-fetched and re-admitted them itself. Since @blobbi-kit/core 0.5.1 legacy
 * detection is schema-based only, and the workaround is gone. This file pins
 * the behaviour Ditto now relies on instead.
 */
import { describe, it, expect } from 'vitest';
import {
  KIND_BLOBBI_STATE,
  BLOBBI_ECOSYSTEM_NAMESPACE,
  getCanonicalBlobbiD,
  deriveBlobbiSeedV1,
  isLegacyBlobbiEvent,
  isValidBlobbiEvent,
  parseBlobbiEvent,
  type NostrEvent,
} from '@blobbi-kit/core';

const PUBKEY = 'a'.repeat(64);

/** A kind 31124 event shaped the way Blobbi Island publishes it. */
function makeIslandEvent({
  petId = '3196847fb5',
  name = 'Brook',
  stage = 'baby',
  branding = [['client', 'blobbi']],
  extraTags = [],
  createdAt = 1_700_000_000,
}: {
  petId?: string;
  name?: string;
  stage?: 'egg' | 'baby' | 'adult';
  branding?: string[][];
  extraTags?: string[][];
  createdAt?: number;
} = {}): NostrEvent {
  const d = getCanonicalBlobbiD(PUBKEY, petId);
  const seed = deriveBlobbiSeedV1(PUBKEY, d, createdAt);
  return {
    id: 'e'.repeat(64),
    pubkey: PUBKEY,
    created_at: createdAt,
    kind: KIND_BLOBBI_STATE,
    content: '',
    sig: 'f'.repeat(128),
    tags: [
      ['d', d],
      ['b', BLOBBI_ECOSYSTEM_NAMESPACE],
      ['stage', stage],
      ['state', 'active'],
      ['last_interaction', String(createdAt)],
      ['name', name],
      ['seed', seed],
      ...extraTags,
      ...branding,
    ],
  };
}

/** The exact predicate `useBlobbisCollection` keeps events with. */
const collectionKeeps = (event: NostrEvent) => isValidBlobbiEvent(event) && !isLegacyBlobbiEvent(event);

describe('canonical events with historical branding are current, not legacy', () => {
  it('client=blobbi on an Island-shaped event is not legacy and parses with isLegacy=false', () => {
    const event = makeIslandEvent();
    expect(isValidBlobbiEvent(event)).toBe(true);
    expect(isLegacyBlobbiEvent(event)).toBe(false);
    expect(collectionKeeps(event)).toBe(true);
    const parsed = parseBlobbiEvent(event);
    expect(parsed?.isLegacy).toBe(false);
    expect(parsed?.name).toBe('Brook');
    expect(parsed?.stage).toBe('baby');
    // No tag: the original artwork generation.
    expect(parsed?.visualGeneration).toBe('v1');
  });

  it('t=blobbi alone is equally harmless', () => {
    const event = makeIslandEvent({ branding: [['t', 'blobbi']] });
    expect(isLegacyBlobbiEvent(event)).toBe(false);
    expect(collectionKeeps(event)).toBe(true);
  });

  it('both branding tags, empty content, no Ditto mission JSON: still a displayable Blobbi', () => {
    const event = makeIslandEvent({ branding: [['client', 'blobbi'], ['t', 'blobbi']], stage: 'adult' });
    expect(collectionKeeps(event)).toBe(true);
    expect(parseBlobbiEvent(event)?.stage).toBe('adult');
  });
});

describe('genuinely old-app events stay excluded', () => {
  it('an old-app schema tag makes the event legacy, branding or not', () => {
    for (const branding of [[], [['client', 'blobbi']]]) {
      const event = makeIslandEvent({ branding, extraTags: [['incubation_time', '3600']] });
      expect(isLegacyBlobbiEvent(event)).toBe(true);
      expect(collectionKeeps(event)).toBe(false);
    }
  });

  it('a non-canonical d or a missing seed stays legacy', () => {
    const badD = makeIslandEvent();
    badD.tags = badD.tags.map((t) => (t[0] === 'd' ? ['d', 'not-a-canonical-d'] : t));
    expect(collectionKeeps(badD)).toBe(false);
    const noSeed = makeIslandEvent();
    noSeed.tags = noSeed.tags.filter(([n]) => n !== 'seed');
    expect(collectionKeeps(noSeed)).toBe(false);
  });
});

describe('the host-side recovery workaround is gone', () => {
  it('no interop-recovery module or hook remains in the source tree', async () => {
    const { existsSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    expect(existsSync(resolve(process.cwd(), 'src/blobbi/onboarding/lib/interop-recovery.ts'))).toBe(false);
    expect(existsSync(resolve(process.cwd(), 'src/blobbi/onboarding/hooks/useRecoveredBlobbis.ts'))).toBe(false);
  });
});
