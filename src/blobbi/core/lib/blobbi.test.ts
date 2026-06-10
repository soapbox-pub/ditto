import { describe, it, expect } from 'vitest';
import type { NostrEvent } from '@nostrify/nostrify';

import {
  KIND_BLOBBI_STATE,
  BLOBBI_ECOSYSTEM_NAMESPACE,
  buildEggTags,
  getCanonicalBlobbiD,
  isCanonicalBlobbiD,
  isValidBlobbiEvent,
  isLegacyBlobbiEvent,
  parseBlobbiEvent,
  deriveBlobbiSeedV1,
  getTagValue,
} from './blobbi';

// A deterministic 64-char hex pubkey for tests.
const PUBKEY = 'a'.repeat(64);
const PET_ID = '0123456789';
const CREATED_AT = 1_700_000_000;

/**
 * Build a fully-formed canonical Kind 31124 Blobbi event (egg stage) the same
 * way the app creates new Blobbis.
 */
function makeCanonicalEggEvent(overrides: Partial<NostrEvent> = {}): NostrEvent {
  const tags = buildEggTags(PUBKEY, PET_ID, CREATED_AT, 'Sparky');
  return {
    id: 'f'.repeat(64),
    pubkey: PUBKEY,
    created_at: CREATED_AT,
    kind: KIND_BLOBBI_STATE,
    tags,
    content: '',
    sig: '0'.repeat(128),
    ...overrides,
  };
}

describe('canonical Blobbi d-tag', () => {
  it('buildEggTags produces a canonical d-tag', () => {
    const d = getCanonicalBlobbiD(PUBKEY, PET_ID);
    expect(isCanonicalBlobbiD(d)).toBe(true);
    expect(d).toBe(`blobbi-${PUBKEY.slice(0, 12)}-${PET_ID}`);
  });

  it('rejects non-canonical (old-app legacy) d-tags', () => {
    expect(isCanonicalBlobbiD('blobbi-puck')).toBe(false);
    expect(isCanonicalBlobbiD('blobbi-fluffy')).toBe(false);
    expect(isCanonicalBlobbiD(`blobbi-${PUBKEY.slice(0, 12)}`)).toBe(false);
  });
});

describe('isValidBlobbiEvent (current canonical events)', () => {
  it('accepts a freshly built canonical egg event', () => {
    expect(isValidBlobbiEvent(makeCanonicalEggEvent())).toBe(true);
  });

  it('rejects events with the wrong kind', () => {
    expect(isValidBlobbiEvent(makeCanonicalEggEvent({ kind: 1 }))).toBe(false);
  });

  it('rejects events missing the ecosystem namespace tag', () => {
    const event = makeCanonicalEggEvent();
    event.tags = event.tags.filter(([name]) => name !== 'b');
    expect(isValidBlobbiEvent(event)).toBe(false);
  });

  it('accepts all current activity states', () => {
    for (const state of ['active', 'sleeping', 'hibernating']) {
      const event = makeCanonicalEggEvent();
      event.tags = event.tags.map((t) => (t[0] === 'state' ? ['state', state] : t));
      expect(isValidBlobbiEvent(event)).toBe(true);
    }
  });
});

describe('isLegacyBlobbiEvent', () => {
  it('returns false for a current canonical event', () => {
    expect(isLegacyBlobbiEvent(makeCanonicalEggEvent())).toBe(false);
  });

  it('returns true for an old-app non-canonical d-tag', () => {
    const event = makeCanonicalEggEvent();
    event.tags = event.tags.map((t) => (t[0] === 'd' ? ['d', 'blobbi-puck'] : t));
    expect(isLegacyBlobbiEvent(event)).toBe(true);
  });

  it('returns true when the seed tag is missing', () => {
    const event = makeCanonicalEggEvent();
    event.tags = event.tags.filter(([name]) => name !== 'seed');
    expect(isLegacyBlobbiEvent(event)).toBe(true);
  });
});

describe('parseBlobbiEvent (current canonical events)', () => {
  it('parses a canonical egg event with the expected core fields', () => {
    const companion = parseBlobbiEvent(makeCanonicalEggEvent());
    expect(companion).toBeDefined();
    expect(companion!.d).toBe(getCanonicalBlobbiD(PUBKEY, PET_ID));
    expect(companion!.name).toBe('Sparky');
    expect(companion!.stage).toBe('egg');
    expect(companion!.state).toBe('active');
    expect(companion!.progressionState).toBe('none');
    expect(companion!.isLegacy).toBe(false);
  });

  it('uses the stored seed and derives visual traits from it', () => {
    const event = makeCanonicalEggEvent();
    const companion = parseBlobbiEvent(event)!;
    const expectedSeed = deriveBlobbiSeedV1(
      PUBKEY,
      getCanonicalBlobbiD(PUBKEY, PET_ID),
      CREATED_AT,
    );
    expect(companion.seed).toBe(expectedSeed);
    // Visual trait tags mirror the seed-derived identity.
    expect(companion.visualTraits.baseColor).toBe(getTagValue(event.tags, 'base_color'));
    expect(companion.visualTraits.pattern).toBe(getTagValue(event.tags, 'pattern'));
    expect(companion.visualTraits.size).toBe(getTagValue(event.tags, 'size'));
  });

  it('parses default egg stats', () => {
    const companion = parseBlobbiEvent(makeCanonicalEggEvent())!;
    expect(companion.stats.hunger).toBe(100);
    expect(companion.stats.happiness).toBe(100);
    expect(companion.stats.health).toBe(100);
    expect(companion.stats.hygiene).toBe(100);
    expect(companion.stats.energy).toBe(100);
  });

  it('normalises a legacy "incubating" state into progressionState (read compatibility)', () => {
    const event = makeCanonicalEggEvent();
    event.tags = event.tags
      .filter(([name]) => name !== 'progression_state')
      .map((t) => (t[0] === 'state' ? ['state', 'incubating'] : t));
    const companion = parseBlobbiEvent(event)!;
    expect(companion.state).toBe('active');
    expect(companion.progressionState).toBe('incubating');
  });

  it('returns undefined for an invalid event', () => {
    expect(parseBlobbiEvent(makeCanonicalEggEvent({ kind: 1 }))).toBeUndefined();
  });
});

describe('buildEggTags (new Blobbi creation)', () => {
  it('includes all required canonical tags', () => {
    const tags = buildEggTags(PUBKEY, PET_ID, CREATED_AT, 'Egg');
    expect(getTagValue(tags, 'b')).toBe(BLOBBI_ECOSYSTEM_NAMESPACE);
    expect(getTagValue(tags, 'stage')).toBe('egg');
    expect(getTagValue(tags, 'state')).toBe('active');
    expect(getTagValue(tags, 'progression_state')).toBe('none');
    expect(getTagValue(tags, 'seed')).toHaveLength(64);
    expect(isCanonicalBlobbiD(getTagValue(tags, 'd')!)).toBe(true);
  });
});
