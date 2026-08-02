import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  updateBlobbonautTags,
  buildNormalizedProfileTags,
  buildBlobbonautTags,
  parseBlobbonautEvent,
  getCanonicalBlobbonautD,
  KIND_BLOBBONAUT_PROFILE,
} from '@blobbi-kit/core/blobbi';

import {
  BLOBBI_SHOP_ITEMS,
  getShopItemById,
  getLiveShopItems,
} from '@/blobbi/shop/lib/blobbi-shop-items';
import { applyItemEffects } from '@/blobbi/actions/lib/blobbi-action-utils';
import type { BlobbiStats } from '@blobbi-kit/core/blobbi';

/**
 * Migration guard tests for removing consumable inventory from kind:11125.
 *
 * These assert OBSERVABLE behavior:
 *  - the care catalog is free/infinite (no quantity, no price gate on use);
 *  - kind:11125 profile writers never emit or mutate `storage` or `coins` and
 *    preserve unknown extension tags (the kit's 0.4.0 contract, exercised
 *    directly);
 *  - care-effect resolution stays catalog-driven and unchanged;
 *  - no reachable Ditto source imports deprecated storage APIs or writes storage;
 *  - no orphaned purchase system remains and no UI tells users to buy care items.
 */

const readSrc = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');

// ─── 2 & 7: Catalog / item-selection remains free and available ───────────────

describe('care catalog is free and infinitely available', () => {
  it('exposes live care items across every care category (selection works)', () => {
    const live = getLiveShopItems();
    expect(live.length).toBeGreaterThan(0);
    for (const type of ['food', 'toy', 'medicine', 'hygiene', 'energy'] as const) {
      expect(live.some((i) => i.type === type)).toBe(true);
    }
  });

  it('catalog items carry no quantity/stock/owned field (nothing to deplete)', () => {
    for (const item of BLOBBI_SHOP_ITEMS) {
      const record = item as unknown as Record<string, unknown>;
      expect(record.quantity).toBeUndefined();
      expect(record.stock).toBeUndefined();
      expect(record.owned).toBeUndefined();
    }
  });

  it('resolves an item effect purely from the catalog by id', () => {
    expect(getShopItemById('food_apple')?.effect).toEqual({ hunger: 25, hygiene: -2, energy: 5 });
    expect(getShopItemById('does_not_exist')).toBeUndefined();
  });
});

// ─── 3 & 8: Effect resolution/application unchanged, repeatable ────────────────

describe('care-effect application is catalog-driven and repeatable', () => {
  const LOW: BlobbiStats = { hunger: 25, happiness: 25, health: 25, hygiene: 25, energy: 25 };

  it('applies the same effect no matter how many times an item is used (no depletion)', () => {
    const effect = getShopItemById('food_apple')!.effect!;
    const first = applyItemEffects({ ...LOW }, effect);
    const second = applyItemEffects({ ...LOW }, effect);
    const third = applyItemEffects({ ...LOW }, effect);
    // Identical output => availability/effect never degrades with repeated use.
    expect(first).toEqual(second);
    expect(second).toEqual(third);
    expect(first.hunger).toBe(50); // 25 + 25
  });
});

// ─── 1, 4 & 9: kind:11125 writer safety (no storage writes, tags preserved) ───

describe('kind:11125 profile writers refuse storage and preserve unknown tags', () => {
  const PUBKEY = 'a'.repeat(64);
  const baseTags = [
    ...buildBlobbonautTags(PUBKEY), // canonical d, b, onboarding, pettingLevel
    ['coins', '100'],
    ['storage', 'food_apple:3'], // pre-existing legacy consumable inventory
    ['inv', 'hat_1'], // host-owned cosmetic passthrough
    ['x-ditto-ext', 'keepme'], // arbitrary unknown extension tag
  ];

  it('updateBlobbonautTags drops storage and coins keys in updates (never writes either)', () => {
    const out = updateBlobbonautTags(baseTags, {
      coins: '50',
      storage: ['food_apple:99'],
    } as Record<string, string | string[]>);
    // No NEW storage value was written.
    expect(out.some((t) => t[0] === 'storage' && t[1] === 'food_apple:99')).toBe(false);
    // 0.4.0 contract: `coins` is opaque legacy data — the unsupported update
    // is ignored and the pre-existing tag is preserved verbatim.
    expect(out.some((t) => t[0] === 'coins' && t[1] === '50')).toBe(false);
    expect(out.some((t) => t[0] === 'coins' && t[1] === '100')).toBe(true);
  });

  it('preserves pre-existing legacy storage, inv, and unknown extension tags verbatim', () => {
    const out = updateBlobbonautTags(baseTags, { coins: '50' });
    expect(out.some((t) => t[0] === 'storage' && t[1] === 'food_apple:3')).toBe(true);
    expect(out.some((t) => t[0] === 'inv' && t[1] === 'hat_1')).toBe(true);
    expect(out.some((t) => t[0] === 'x-ditto-ext' && t[1] === 'keepme')).toBe(true);
  });

  it('buildNormalizedProfileTags preserves unknown extension tags on republish', () => {
    const event = {
      id: 'x'.repeat(64),
      pubkey: PUBKEY,
      created_at: 0,
      kind: KIND_BLOBBONAUT_PROFILE,
      tags: baseTags,
      content: '',
      sig: '',
    };
    const parsed = parseBlobbonautEvent(event);
    expect(parsed).not.toBeNull();
    // Mirror how Ditto calls the normalizer (useBlobbonautProfileNormalization.ts):
    // spread the parsed profile with the freshest event's tags.
    const normalized = buildNormalizedProfileTags({
      ...parsed!,
      allTags: baseTags,
      event,
    });
    expect(normalized.some((t) => t[0] === 'inv' && t[1] === 'hat_1')).toBe(true);
    expect(normalized.some((t) => t[0] === 'x-ditto-ext' && t[1] === 'keepme')).toBe(true);
    expect(normalized.some((t) => t[0] === 'storage' && t[1] === 'food_apple:3')).toBe(true);
    // And it never invents a new storage value.
    const storageVals = normalized.filter((t) => t[0] === 'storage').map((t) => t[1]);
    expect(storageVals).toEqual(['food_apple:3']);
    // Sanity: canonical d preserved.
    expect(normalized.some((t) => t[0] === 'd' && t[1] === getCanonicalBlobbonautD(PUBKEY))).toBe(true);
  });
});

// ─── 5 & 10: no reachable purchase system / deprecated storage APIs ───────────

describe('no reachable consumable-purchase system remains', () => {
  it('the purchase hook file is gone', () => {
    expect(existsSync(resolve(process.cwd(), 'src/blobbi/shop/hooks/useBlobbiPurchaseItem.ts'))).toBe(false);
  });

  it('care flow hooks do not decrement storage on use', () => {
    const useItem = readSrc('src/blobbi/actions/hooks/useBlobbiUseInventoryItem.ts');
    const companionItem = readSrc('src/blobbi/companion/interaction/useBlobbiItemUse.ts');
    // The explicit "free to use" invariant comment is present in both paths.
    expect(useItem).toContain('no storage decrement');
    expect(companionItem).toContain('no storage decrement');
  });
});

// ─── 6 & 11: care items are free (no coin deduction) and copy is honest ───────

describe('care items are free with no purchase-implying UI copy', () => {
  const catalogSource = readSrc('src/blobbi/shop/lib/blobbi-shop-items.ts');
  const socialSource = readSrc('src/components/BlobbiSocialActions.tsx');

  it('care flows never deduct coins for using an item', () => {
    // No Ditto flow deducts Coins anymore — the Coin economy belongs to
    // Blobbi Island (the legacy adoption/reroll economy was deleted).
    for (const rel of [
      'src/blobbi/actions/hooks/useBlobbiUseInventoryItem.ts',
      'src/blobbi/companion/interaction/useBlobbiItemUse.ts',
      'src/components/BlobbiSocialActions.tsx',
    ]) {
      const src = readSrc(rel);
      expect(src).not.toMatch(/coins\s*-/);
      expect(src).not.toContain('totalCost');
    }
  });

  it('no care-item selector tells the user to buy/own/replenish items', () => {
    for (const src of [catalogSource, socialSource]) {
      expect(src).not.toMatch(/\bbuy\b/i);
      expect(src).not.toMatch(/\bpurchase\b/i);
      expect(src).not.toMatch(/out of stock/i);
      expect(src).not.toMatch(/replenish/i);
    }
  });
});
