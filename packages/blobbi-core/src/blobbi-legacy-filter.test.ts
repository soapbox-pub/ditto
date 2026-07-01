import { describe, it, expect } from 'vitest';
import type { NostrEvent } from '@nostrify/nostrify';

import {
  BLOBBI_ECOSYSTEM_NAMESPACE,
  isValidBlobbiEvent,
  isLegacyBlobbiEvent,
  parseBlobbiEvent,
  type BlobbiCompanion,
} from './blobbi';

// ─── Fixtures ──────────────────────────────────────────────────────────────────
//
// These tests verify that old-format / unsupported Blobbi events are filtered out
// at the parsed-companion layer (the same logic useBlobbisCollection applies before
// any UI selection happens). isValidBlobbiEvent stays schema-level; isLegacy is the
// gate that hides events from the page, widget, floating companion, and selection.

const PUBKEY = 'a'.repeat(64);
const SEED = 'b'.repeat(64); // 64-char seed → not legacy on the seed check
const CANONICAL_D = 'blobbi-aaaaaaaaaaaa-1234567890'; // blobbi-{12hex}-{10hex}
const LEGACY_D = 'blobbi-puck'; // valid schema, non-canonical → legacy

/** Build a schema-valid kind 31124 event with the given tag overrides. */
function makeBlobbiEvent(overrides: { d: string; seed?: string; name?: string }): NostrEvent {
  const tags: string[][] = [
    ['d', overrides.d],
    ['b', BLOBBI_ECOSYSTEM_NAMESPACE],
    ['stage', 'baby'],
    ['state', 'active'],
    ['last_interaction', '1700000000'],
  ];
  if (overrides.seed !== undefined) tags.push(['seed', overrides.seed]);
  if (overrides.name !== undefined) tags.push(['name', overrides.name]);

  return {
    id: 'id-' + overrides.d,
    pubkey: PUBKEY,
    created_at: 1700000000,
    kind: 31124,
    tags,
    content: '',
    sig: '0'.repeat(128),
  };
}

/** Canonical (current-format) Blobbi: canonical d + 64-char seed + name. */
function makeCanonicalEvent(): NostrEvent {
  return makeBlobbiEvent({ d: CANONICAL_D, seed: SEED, name: 'Puck' });
}

/** Old-format Blobbi: schema-valid but non-canonical d, missing seed/name. */
function makeLegacyEvent(): NostrEvent {
  return makeBlobbiEvent({ d: LEGACY_D });
}

/**
 * Replicates the useBlobbisCollection parse pipeline: schema-validate, parse,
 * then drop legacy companions. Returns companions exactly as the UI sees them.
 */
function collectVisibleCompanions(events: NostrEvent[]): BlobbiCompanion[] {
  const companions: BlobbiCompanion[] = [];
  for (const event of events.filter(isValidBlobbiEvent)) {
    const parsed = parseBlobbiEvent(event);
    if (parsed && !parsed.isLegacy) {
      companions.push(parsed);
    }
  }
  return companions;
}

// ─── Sanity: fixtures classify as expected ──────────────────────────────────────

describe('blobbi legacy fixtures', () => {
  it('canonical event is schema-valid and not legacy', () => {
    const event = makeCanonicalEvent();
    expect(isValidBlobbiEvent(event)).toBe(true);
    expect(isLegacyBlobbiEvent(event)).toBe(false);
  });

  it('legacy event is schema-valid but flagged legacy', () => {
    const event = makeLegacyEvent();
    expect(isValidBlobbiEvent(event)).toBe(true);
    expect(isLegacyBlobbiEvent(event)).toBe(true);
  });
});

// ─── Filtering before UI selection ──────────────────────────────────────────────

describe('old-format events filtered before UI selection', () => {
  it('legacy-only: collection returns no companions', () => {
    const companions = collectVisibleCompanions([makeLegacyEvent()]);
    expect(companions).toHaveLength(0);
  });

  it('mixed old + current: only the canonical Blobbi is returned', () => {
    const companions = collectVisibleCompanions([makeLegacyEvent(), makeCanonicalEvent()]);
    expect(companions).toHaveLength(1);
    expect(companions[0].d).toBe(CANONICAL_D);
    expect(companions[0].isLegacy).toBe(false);
  });

  it('current-only: canonical Blobbi still appears normally', () => {
    const companions = collectVisibleCompanions([makeCanonicalEvent()]);
    expect(companions).toHaveLength(1);
    expect(companions[0].d).toBe(CANONICAL_D);
  });

  it('a stored or profile legacy d-tag cannot resolve to a companion', () => {
    // Selection logic (page + widget) only ever looks up d-tags in the
    // collection. A legacy d is absent, so it can never be selected.
    const companions = collectVisibleCompanions([makeLegacyEvent(), makeCanonicalEvent()]);
    const byD: Record<string, BlobbiCompanion> = {};
    for (const c of companions) byD[c.d] = c;

    expect(byD[LEGACY_D]).toBeUndefined();
    expect(byD[CANONICAL_D]).toBeDefined();
  });
});
