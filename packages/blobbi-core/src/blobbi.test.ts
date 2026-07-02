import { describe, it, expect } from 'vitest';
import type { NostrEvent } from '@nostrify/nostrify';

import {
  KIND_BLOBBI_STATE,
  BLOBBI_ECOSYSTEM_NAMESPACE,
  buildEggTags,
  buildBlobbiAddress,
  parseBlobbiAddress,
  getCanonicalBlobbiD,
  getSelectedBlobbiKey,
  isCanonicalBlobbiD,
  isValidBlobbiEvent,
  isLegacyBlobbiEvent,
  isUnsupportedLegacyBlobbiEvent,
  mergeHasForAdoption,
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

describe('Blobbi address helpers (build/parse 31124:<pubkey>:<d>)', () => {
  const D = getCanonicalBlobbiD(PUBKEY, PET_ID);

  it('buildBlobbiAddress produces a canonical coordinate', () => {
    expect(buildBlobbiAddress(PUBKEY, D)).toBe(`${KIND_BLOBBI_STATE}:${PUBKEY}:${D}`);
    expect(buildBlobbiAddress(PUBKEY, D)).toBe(`31124:${PUBKEY}:${D}`);
  });

  it('round-trips build → parse', () => {
    const address = buildBlobbiAddress(PUBKEY, D);
    const parsed = parseBlobbiAddress(address);
    expect(parsed).toEqual({ kind: KIND_BLOBBI_STATE, pubkey: PUBKEY, d: D });
  });

  it('parses a hand-written canonical coordinate', () => {
    expect(parseBlobbiAddress(`31124:${PUBKEY}:${D}`)).toEqual({
      kind: KIND_BLOBBI_STATE,
      pubkey: PUBKEY,
      d: D,
    });
  });

  it('returns undefined for malformed / non-31124 addresses', () => {
    // Wrong kind
    expect(parseBlobbiAddress(`11125:${PUBKEY}:${D}`)).toBeUndefined();
    expect(parseBlobbiAddress(`1124:${PUBKEY}:${D}`)).toBeUndefined();
    // Too few parts
    expect(parseBlobbiAddress(`31124:${PUBKEY}`)).toBeUndefined();
    expect(parseBlobbiAddress('31124')).toBeUndefined();
    // Too many parts
    expect(parseBlobbiAddress(`31124:${PUBKEY}:${D}:extra`)).toBeUndefined();
    // Empty pubkey / d
    expect(parseBlobbiAddress(`31124::${D}`)).toBeUndefined();
    expect(parseBlobbiAddress(`31124:${PUBKEY}:`)).toBeUndefined();
    expect(parseBlobbiAddress('31124::')).toBeUndefined();
    // Empty / junk
    expect(parseBlobbiAddress('')).toBeUndefined();
    expect(parseBlobbiAddress('not-an-address')).toBeUndefined();
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

describe('legacy Blobbi exclusion (no auto-migration / unsupported old-app events)', () => {
  /**
   * Build an old-app legacy Blobbi event: a non-canonical d-tag and no seed.
   * These are unsupported in the new app and must be invisible / never
   * migrated or republished.
   */
  function makeLegacyBlobbiEvent(overrides: Partial<NostrEvent> = {}): NostrEvent {
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

  /**
   * Mirrors the filter used by useBlobbisCollection and fetchFreshCompanion:
   * keep only valid, non-legacy (canonical) events.
   */
  function keepCanonical(events: NostrEvent[]): NostrEvent[] {
    return events.filter((e) => isValidBlobbiEvent(e) && !isLegacyBlobbiEvent(e));
  }

  it('detects the legacy fixture as legacy and the canonical fixture as canonical', () => {
    expect(isLegacyBlobbiEvent(makeLegacyBlobbiEvent())).toBe(true);
    expect(isLegacyBlobbiEvent(makeCanonicalEggEvent())).toBe(false);
  });

  it('excludes a legacy event from the UI-facing collection filter', () => {
    const kept = keepCanonical([makeLegacyBlobbiEvent()]);
    expect(kept).toHaveLength(0);
  });

  it('treats a user with only legacy events as having no current Blobbi', () => {
    const events = [
      makeLegacyBlobbiEvent({ id: '1'.repeat(64) }),
      makeLegacyBlobbiEvent({ id: '2'.repeat(64) }),
    ];
    const companions = keepCanonical(events)
      .map(parseBlobbiEvent)
      .filter((c): c is NonNullable<typeof c> => !!c);
    expect(companions).toHaveLength(0);
  });

  it('keeps only the canonical event when legacy and canonical are mixed', () => {
    const events = [makeLegacyBlobbiEvent(), makeCanonicalEggEvent()];
    const kept = keepCanonical(events);
    expect(kept).toHaveLength(1);
    const companion = parseBlobbiEvent(kept[0])!;
    expect(companion.isLegacy).toBe(false);
    expect(isCanonicalBlobbiD(companion.d)).toBe(true);
    expect(companion.d).toBe(getCanonicalBlobbiD(PUBKEY, PET_ID));
  });

  it('a stored legacy d-tag cannot select a Blobbi (not present in the collection map)', () => {
    // The collection only contains canonical companions keyed by their d-tag.
    const collectionByD: Record<string, ReturnType<typeof parseBlobbiEvent>> = {};
    for (const e of keepCanonical([makeLegacyBlobbiEvent(), makeCanonicalEggEvent()])) {
      const parsed = parseBlobbiEvent(e);
      if (parsed) collectionByD[parsed.d] = parsed;
    }
    // A persisted legacy selection ("blobbi-puck") does not resolve to anything.
    expect(collectionByD['blobbi-puck']).toBeUndefined();
    // The canonical companion is still selectable.
    expect(collectionByD[getCanonicalBlobbiD(PUBKEY, PET_ID)]).toBeDefined();
  });

  it('a current canonical Blobbi still parses, is non-legacy, and is actionable', () => {
    const kept = keepCanonical([makeCanonicalEggEvent()]);
    expect(kept).toHaveLength(1);
    const companion = parseBlobbiEvent(kept[0])!;
    expect(companion.isLegacy).toBe(false);
    expect(companion.name).toBe('Sparky');
    // Has a usable seed → actions/seed-sync can operate on it.
    expect(companion.seed).toHaveLength(64);
    expect(companion.event).toBeDefined();
  });
});

describe('old-app Blobbi with canonical-looking d-tag (schema-marker detection)', () => {
  // Exact old-app fixture from the manual test: a 31124 egg whose d-tag is in
  // the current canonical format, with a valid seed, but carrying old-app /
  // deprecated schema tags and client/topic markers.
  const OLD_APP_D = 'blobbi-feb88e80a63d-24a46c4828';

  /**
   * Build the old-app event. It is a structurally-valid 31124 (canonical d,
   * seed, name, stage, state, stats, ecosystem tag) so the ONLY thing that
   * marks it as unsupported is the old-app schema tags.
   */
  function makeOldAppEvent(overrides: Partial<NostrEvent> = {}): NostrEvent {
    const seed = 'a'.repeat(64);
    return {
      id: 'd'.repeat(64),
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      kind: KIND_BLOBBI_STATE,
      tags: [
        ['d', OLD_APP_D],
        ['b', BLOBBI_ECOSYSTEM_NAMESPACE],
        ['name', 'Blobbi'],
        ['stage', 'egg'],
        ['state', 'active'],
        ['seed', seed],
        ['last_interaction', CREATED_AT.toString()],
        // Old-app / deprecated schema markers:
        ['incubation_time', '3600'],
        ['incubation_progress', '42'],
        ['egg_temperature', '37'],
        ['egg_status', 'warming'],
        ['shell_integrity', '88'],
        ['fees', '0'],
        ['t', 'blobbi'],
        ['client', 'blobbi'],
      ],
      content: '',
      sig: '0'.repeat(128),
      ...overrides,
    };
  }

  /** A current Ditto-created canonical egg sharing the SAME d-tag. */
  function makeCurrentDittoEventSameD(): NostrEvent {
    // Build a canonical egg, then force its d-tag to match the old-app one.
    const tags = buildEggTags(PUBKEY, PET_ID, CREATED_AT, 'Sparky').map((t) =>
      t[0] === 'd' ? ['d', OLD_APP_D] : t,
    );
    return {
      id: 'c'.repeat(64),
      pubkey: PUBKEY,
      created_at: CREATED_AT + 1, // newer; filter excludes old-app regardless of created_at
      kind: KIND_BLOBBI_STATE,
      tags,
      content: '',
      sig: '0'.repeat(128),
    };
  }

  function keepCanonical(events: NostrEvent[]): NostrEvent[] {
    return events.filter((e) => isValidBlobbiEvent(e) && !isLegacyBlobbiEvent(e));
  }

  it('isUnsupportedLegacyBlobbiEvent detects the old-app event despite a canonical d-tag', () => {
    expect(isUnsupportedLegacyBlobbiEvent(makeOldAppEvent())).toBe(true);
  });

  it('isLegacyBlobbiEvent treats the old-app event as legacy/unsupported', () => {
    expect(isLegacyBlobbiEvent(makeOldAppEvent())).toBe(true);
  });

  it('parseBlobbiEvent flags isLegacy=true for the old-app event', () => {
    const companion = parseBlobbiEvent(makeOldAppEvent())!;
    expect(companion).toBeDefined();
    expect(companion.isLegacy).toBe(true);
  });

  it('detection is marker-based, not just one tag: each old-app marker alone flags it', () => {
    const markers: Array<[string, string]> = [
      ['incubation_time', '1'],
      ['incubation_progress', '1'],
      ['egg_temperature', '1'],
      ['egg_status', 'x'],
      ['shell_integrity', '1'],
      ['fees', '0'],
      ['start_incubation', '1'],
      ['t', 'blobbi'],
      ['client', 'blobbi'],
    ];
    for (const marker of markers) {
      const event = makeCanonicalEggEvent();
      event.tags = [...event.tags, marker];
      expect(isUnsupportedLegacyBlobbiEvent(event)).toBe(true);
      expect(isLegacyBlobbiEvent(event)).toBe(true);
    }
  });

  it('excludes the old-app event from the UI-facing collection filter', () => {
    expect(keepCanonical([makeOldAppEvent()])).toHaveLength(0);
  });

  it('a legacy-only collection (old-app schema) returns empty', () => {
    const companions = keepCanonical([makeOldAppEvent()])
      .map(parseBlobbiEvent)
      .filter((c): c is NonNullable<typeof c> => !!c);
    expect(companions).toHaveLength(0);
  });

  it('keeps only the current Ditto event when mixed with an old-app event on the same d-tag', () => {
    // The filter runs BEFORE newest-per-d dedup, so the old-app event is
    // removed regardless of created_at, leaving only the current Ditto event.
    const kept = keepCanonical([makeOldAppEvent(), makeCurrentDittoEventSameD()]);
    expect(kept).toHaveLength(1);
    const companion = parseBlobbiEvent(kept[0])!;
    expect(companion.isLegacy).toBe(false);
    expect(companion.d).toBe(OLD_APP_D);
    expect(companion.name).toBe('Sparky');
  });

  it('a stored old-app d-tag cannot select a Blobbi (not present in the collection map)', () => {
    const collectionByD: Record<string, ReturnType<typeof parseBlobbiEvent>> = {};
    for (const e of keepCanonical([makeOldAppEvent()])) {
      const parsed = parseBlobbiEvent(e);
      if (parsed) collectionByD[parsed.d] = parsed;
    }
    expect(collectionByD[OLD_APP_D]).toBeUndefined();
  });

  it('does NOT classify a current Ditto canonical event (with a seed) as unsupported', () => {
    const event = makeCanonicalEggEvent();
    expect(isUnsupportedLegacyBlobbiEvent(event)).toBe(false);
    expect(isLegacyBlobbiEvent(event)).toBe(false);
    // A freshly-built egg carries a seed but none of the old-app markers.
    expect(getTagValue(event.tags, 'seed')).toHaveLength(64);
  });

  it('the current Ditto event does not carry any old-app schema markers', () => {
    const tags = buildEggTags(PUBKEY, PET_ID, CREATED_AT, 'Sparky');
    const names = new Set(tags.map(([n]) => n));
    for (const marker of [
      'incubation_time', 'incubation_progress', 'egg_temperature', 'egg_status',
      'shell_integrity', 'fees', 'start_incubation', 'interact_6_progress', 't', 'client',
    ]) {
      expect(names.has(marker)).toBe(false);
    }
  });
});

describe('getSelectedBlobbiKey — shared selected-Blobbi persistence key', () => {
  // Both BlobbiPage and BlobbiWidget import this single helper, so a selection
  // made on one surface is visible to the other. Previously the widget keyed by
  // a truncated pubkey, desyncing the two and leaving one surface on a fresh egg.
  it('derives the same full-pubkey key for every surface', () => {
    const pk = 'a'.repeat(64);
    expect(getSelectedBlobbiKey(pk)).toBe(`blobbi:selected:d:${pk}`);
  });
});

describe('mergeHasForAdoption — adoption must never drop an owned Blobbi', () => {
  // Failure shape diagnosed from a real user: their evolving Blobbi was dropped
  // from `has` when a fresh relay read came back wiped, so adoption (which used
  // `freshProfile?.has ?? profile.has`) collapsed `has` to a single egg.
  it('preserves the original when one read is momentarily empty', () => {
    const ORIGINAL = 'blobbi-236ac926d53c-360fc30e93';
    const NEW_EGG = 'blobbi-236ac926d53c-3c0c91148a';
    expect(mergeHasForAdoption([ORIGINAL], [], NEW_EGG)).toEqual([ORIGINAL, NEW_EGG]);
  });
});


