import { describe, it, expect } from 'vitest';

import {
  KIND_BLOBBI_STATE,
  BLOBBI_ECOSYSTEM_NAMESPACE,
  getCanonicalBlobbiD,
  deriveBlobbiSeedV1,
  isValidBlobbiEvent,
  parseBlobbiEvent,
  type BlobbiCompanion,
} from '@blobbi-kit/core/blobbi';
import type { NostrEvent } from '@nostrify/nostrify';

import { decideFirstHatch, hasExistingBlobbi } from './first-hatch-decision';

// A stable, valid-length hex pubkey for building canonical d-tags.
const PUBKEY = 'a'.repeat(64);

/**
 * Build a realistic kind 31124 Blobbi state event the way Blobbi Island would:
 * only the tags required to be a valid Blobbi, empty content, and NO
 * Ditto-specific hatch/mission/streak JSON. This proves such an event parses
 * into a valid companion and is treated as an existing Blobbi.
 */
function makeBlobbiEvent(
  stage: 'egg' | 'baby' | 'adult',
  {
    petId = '0123456789',
    content = '',
    extraTags = [],
  }: { petId?: string; content?: string; extraTags?: string[][] } = {},
): NostrEvent {
  const createdAt = 1_700_000_000;
  const d = getCanonicalBlobbiD(PUBKEY, petId);
  const seed = deriveBlobbiSeedV1(PUBKEY, d, createdAt);
  return {
    id: 'e'.repeat(64),
    pubkey: PUBKEY,
    created_at: createdAt,
    kind: KIND_BLOBBI_STATE,
    content,
    sig: 'f'.repeat(128),
    tags: [
      ['d', d],
      ['b', BLOBBI_ECOSYSTEM_NAMESPACE],
      ['stage', stage],
      ['state', 'active'],
      ['last_interaction', '1700000000'],
      ['name', stage === 'egg' ? 'Egg' : 'Islander'],
      ['seed', seed],
      ...extraTags,
    ],
  };
}

/** Parse a fixture into a validated companion (mirrors useBlobbisCollection). */
function makeCompanion(...args: Parameters<typeof makeBlobbiEvent>): BlobbiCompanion {
  const event = makeBlobbiEvent(...args);
  const parsed = parseBlobbiEvent(event);
  if (!parsed) {
    throw new Error(`fixture failed to parse for stage=${args[0]}`);
  }
  return parsed;
}

describe('Island-created Blobbi validation', () => {
  it('a baby with empty content and no Ditto-specific tags is a valid Blobbi', () => {
    const event = makeBlobbiEvent('baby', { content: '' });
    expect(isValidBlobbiEvent(event)).toBe(true);
    const parsed = parseBlobbiEvent(event);
    expect(parsed).toBeDefined();
    expect(parsed?.stage).toBe('baby');
    // No mission/evolution JSON seeded — still valid.
    expect(parsed?.evolution).toEqual([]);
  });
});

describe('hasExistingBlobbi', () => {
  it('is false when the collection is empty', () => {
    expect(hasExistingBlobbi([])).toBe(false);
  });

  it('is true for an Island-created baby with empty content', () => {
    const baby = makeCompanion('baby', { content: '' });
    expect(hasExistingBlobbi([baby])).toBe(true);
  });

  it('is true for an egg-only collection', () => {
    const egg = makeCompanion('egg');
    expect(hasExistingBlobbi([egg])).toBe(true);
  });
});

describe('decideFirstHatch', () => {
  it('allows the hatch flow when the user has no Blobbi', () => {
    const decision = decideFirstHatch({ companions: [] });
    expect(decision.kind).toBe('allow-hatch');
  });

  it('does NOT allow the hatch flow for an Island-created baby with empty content', () => {
    const baby = makeCompanion('baby', { content: '' });
    const decision = decideFirstHatch({ companions: [baby] });
    expect(decision.kind).toBe('has-blobbi');
    if (decision.kind === 'has-blobbi') {
      expect(decision.selected.d).toBe(baby.d);
    }
  });

  it('counts a Blobbi without Ditto-specific mission/content JSON as existing', () => {
    // A baby whose content is arbitrary non-Ditto JSON (as Island might write).
    const baby = makeCompanion('baby', { content: '{"island":true}' });
    const decision = decideFirstHatch({ companions: [baby] });
    expect(decision.kind).toBe('has-blobbi');
  });

  it('reuses an existing egg instead of creating a new one', () => {
    const egg = makeCompanion('egg');
    const decision = decideFirstHatch({ companions: [egg] });
    expect(decision.kind).toBe('reuse-egg');
    if (decision.kind === 'reuse-egg') {
      expect(decision.egg.d).toBe(egg.d);
    }
  });

  it('prefers the profile current_companion when selecting a hatched Blobbi', () => {
    const first = makeCompanion('baby', { petId: '1111111111' });
    const second = makeCompanion('adult', { petId: '2222222222' });
    const decision = decideFirstHatch({
      companions: [first, second],
      currentCompanionD: second.d,
    });
    expect(decision.kind).toBe('has-blobbi');
    if (decision.kind === 'has-blobbi') {
      expect(decision.selected.d).toBe(second.d);
    }
  });

  it('falls back to the first hatched Blobbi when current_companion does not resolve', () => {
    const first = makeCompanion('baby', { petId: '1111111111' });
    const second = makeCompanion('adult', { petId: '2222222222' });
    const decision = decideFirstHatch({
      companions: [first, second],
      currentCompanionD: 'blobbi-does-not-exist',
    });
    expect(decision.kind).toBe('has-blobbi');
    if (decision.kind === 'has-blobbi') {
      expect(decision.selected.d).toBe(first.d);
    }
  });

  it('does NOT create a duplicate when the profile is missing/stale but a valid state event exists', () => {
    // No currentCompanionD (profile missing or stale) — the existing baby must
    // still suppress the first-hatch flow.
    const baby = makeCompanion('baby', { content: '' });
    const decision = decideFirstHatch({ companions: [baby], currentCompanionD: undefined });
    expect(decision.kind).toBe('has-blobbi');
  });
});
