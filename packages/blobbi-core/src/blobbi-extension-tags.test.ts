import { describe, it, expect } from 'vitest';

import {
  buildEggTags,
  updateBlobbiTags,
  mergeBlobbiStateTagsForRepublish,
  updateBlobbonautTags,
  mergeBlobbonautTagsForRepublish,
  buildBlobbonautTags,
  getTagValues,
} from './blobbi';
import { validateAndRepairBlobbiTags } from './blobbi-tag-schema';

/**
 * These tests lock in a protocol invariant, NOT current-app behavior:
 *
 *   Unknown / unmanaged extension tags MUST survive core's generic
 *   republish/update flows. Host apps (e.g. Blobbi Island) attach their own
 *   tags to Blobbi events — future accessories, `equip` on kind 31124, `inv`
 *   on kind 11125. Core does not understand these tags but must never clobber
 *   them.
 *
 * We are intentionally NOT standardizing `equip`/`inv`, not adding an accessory
 * schema, and not adding an inventory kind. These tests exist so a future
 * change that would silently drop host extension tags fails loudly here.
 */

const PUBKEY = 'a'.repeat(64);
const PET_ID = '0123456789';
const CREATED_AT = 1_700_000_000;

/** Collect all values for a given tag name, order-preserving. */
function valuesFor(tags: string[][], name: string): string[] {
  return tags.filter(([n]) => n === name).map((t) => t[1]);
}

describe('extension tag preservation — kind 31124 (Blobbi state)', () => {
  it('preserves repeated equip tags through updateBlobbiTags', () => {
    const base = buildEggTags(PUBKEY, PET_ID, CREATED_AT, 'Sparky');
    const withEquip = [
      ...base,
      ['equip', 'hat-001'],
      ['equip', 'scarf-002'],
    ];

    const updated = updateBlobbiTags(withEquip, { happiness: '80' });

    expect(valuesFor(updated, 'equip')).toEqual(['hat-001', 'scarf-002']);
    // sanity: the managed update we asked for was applied
    expect(updated.find(([n]) => n === 'happiness')?.[1]).toBe('80');
  });

  it('preserves repeated equip tags through mergeBlobbiStateTagsForRepublish', () => {
    const base = buildEggTags(PUBKEY, PET_ID, CREATED_AT, 'Sparky');
    const withEquip = [...base, ['equip', 'hat-001'], ['equip', 'scarf-002']];

    const merged = mergeBlobbiStateTagsForRepublish(withEquip, { hunger: '50' });

    expect(valuesFor(merged, 'equip')).toEqual(['hat-001', 'scarf-002']);
  });

  it('preserves equip tags through the stage-transition cleanup path (cleanupTaskTags: true)', () => {
    // Simulate a baby event mid-progression carrying host equip tags + task tags.
    const base = buildEggTags(PUBKEY, PET_ID, CREATED_AT, 'Sparky');
    const babyTags = base
      .map((t) => (t[0] === 'stage' ? ['stage', 'baby'] : t))
      .filter(([n]) => n !== 'progression_state');
    const withExtras = [
      ...babyTags,
      ['progression_state', 'evolving'],
      ['progression_started_at', String(CREATED_AT)],
      ['task', 'feed:3'],
      ['task_completed', 'feed'],
      ['equip', 'hat-001'],
      ['equip', 'scarf-002'],
    ];

    const result = validateAndRepairBlobbiTags(withExtras, withExtras, {
      cleanupTaskTags: true,
    });

    // Task tags were cleaned up (expected)...
    expect(valuesFor(result.tags, 'task')).toEqual([]);
    expect(valuesFor(result.tags, 'progression_state')).toEqual([]);
    // ...but host extension tags MUST survive the cleanup.
    expect(valuesFor(result.tags, 'equip')).toEqual(['hat-001', 'scarf-002']);
  });

  it('does not invent or strip equip tags when none are present', () => {
    const base = buildEggTags(PUBKEY, PET_ID, CREATED_AT, 'Sparky');
    const updated = updateBlobbiTags(base, { energy: '90' });
    expect(valuesFor(updated, 'equip')).toEqual([]);
  });
});

describe('extension tag preservation — kind 11125 (Blobbonaut profile)', () => {
  it('preserves repeated inv tags through updateBlobbonautTags', () => {
    const base = buildBlobbonautTags(PUBKEY);
    const withInv = [
      ...base,
      ['inv', 'potion:3'],
      ['inv', 'key:1'],
    ];

    const updated = updateBlobbonautTags(withInv, { coins: '150' });

    expect(valuesFor(updated, 'inv')).toEqual(['potion:3', 'key:1']);
    expect(updated.find(([n]) => n === 'coins')?.[1]).toBe('150');
  });

  it('preserves repeated inv tags through mergeBlobbonautTagsForRepublish', () => {
    const base = buildBlobbonautTags(PUBKEY);
    const withInv = [...base, ['inv', 'potion:3'], ['inv', 'key:1']];

    const merged = mergeBlobbonautTagsForRepublish(withInv, { xp: '42' });

    expect(valuesFor(merged, 'inv')).toEqual(['potion:3', 'key:1']);
  });

  it('still deduplicates managed has tags while preserving inv', () => {
    const base = buildBlobbonautTags(PUBKEY);
    const withDup = [
      ...base,
      ['has', 'blobbi-x'],
      ['has', 'blobbi-x'],
      ['inv', 'potion:3'],
    ];

    const merged = updateBlobbonautTags(withDup, {});

    expect(getTagValues(merged, 'has')).toEqual(['blobbi-x']);
    expect(valuesFor(merged, 'inv')).toEqual(['potion:3']);
  });
});
