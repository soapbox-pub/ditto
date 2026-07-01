import { describe, it, expect } from 'vitest';
import type { NostrEvent } from '@nostrify/nostrify';

// Raw source of the module under test, so we can assert on its import graph
// without depending on Node fs / file-URL resolution under jsdom.
import projectionSource from './blobbi-social-projection.ts?raw';

import {
  applySocialInteractions,
  consolidateSocialInteractions,
  type CareItemEffect,
} from './blobbi-social-projection';
import type { BlobbiStats } from './blobbi';
import { STAT_MIN, STAT_MAX } from './blobbi';
import type { BlobbiInteraction, InteractionAction } from './blobbi-interaction';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FULL_STATS: BlobbiStats = { hunger: 100, happiness: 100, health: 100, hygiene: 100, energy: 100 };
const MID_STATS: BlobbiStats = { hunger: 50, happiness: 50, health: 50, hygiene: 50, energy: 50 };

let idCounter = 0;

/** Build a minimal parsed interaction. Each call gets a unique event id so dedup doesn't drop it. */
function interaction(
  action: InteractionAction,
  itemId?: string,
  createdAt = 1_000 + idCounter,
): BlobbiInteraction {
  const id = `event-${idCounter++}`;
  const event = { id, created_at: createdAt } as NostrEvent;
  return {
    event,
    blobbiCoordinate: '31124:owner:blobbi',
    ownerPubkey: 'owner',
    action,
    source: 'test',
    blobbiShortId: undefined,
    itemId,
    authorPubkey: 'author',
    createdAt,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('blobbi-social-projection — care item effect resolver injection', () => {
  it('applies the item-specific effect when the resolver returns one', () => {
    const cakeEffect: CareItemEffect = { hunger: 25, happiness: 30, hygiene: -10, energy: 10 };
    const resolver = (itemId: string) => (itemId === 'food_cake' ? cakeEffect : undefined);

    const result = applySocialInteractions(
      MID_STATS,
      [interaction('feed', 'food_cake')],
      undefined,
      resolver,
    );

    // MID (50) + cake deltas, clamped to [1, 100]
    expect(result).toEqual({
      hunger: 75,     // 50 + 25
      happiness: 80,  // 50 + 30
      health: 50,     // unchanged
      hygiene: 40,    // 50 - 10
      energy: 60,     // 50 + 10
    });
  });

  it('uses the fallback per-action effect when no resolver is provided', () => {
    // 'feed' fallback is { hunger: 10 }
    const result = applySocialInteractions(
      MID_STATS,
      [interaction('feed', 'food_cake')],
      // no checkpoint, no resolver
    );

    expect(result).toEqual({ ...MID_STATS, hunger: 60 }); // 50 + 10 fallback, item ignored
  });

  it('uses the fallback per-action effect when the resolver returns undefined', () => {
    const resolver = () => undefined; // unknown item

    const result = applySocialInteractions(
      MID_STATS,
      [interaction('play', 'unknown_item')],
      undefined,
      resolver,
    );

    // 'play' fallback is { happiness: 10, energy: -5 }
    expect(result).toEqual({ ...MID_STATS, happiness: 60, energy: 45 });
  });

  it('falls back when an itemId is present but no resolver is supplied', () => {
    const result = applySocialInteractions(
      MID_STATS,
      [interaction('clean', 'hyg_soap')],
    );

    // 'clean' fallback is { hygiene: 15 }
    expect(result).toEqual({ ...MID_STATS, hygiene: 65 });
  });

  it('clamps stats to STAT_MAX on the upper bound', () => {
    const bigEffect: CareItemEffect = { hunger: 999 };
    const resolver = () => bigEffect;

    const result = applySocialInteractions(
      FULL_STATS,
      [interaction('feed', 'huge')],
      undefined,
      resolver,
    );

    expect(result.hunger).toBe(STAT_MAX);
    expect(result.hunger).toBe(100);
  });

  it('clamps stats to STAT_MIN on the lower bound', () => {
    const drainEffect: CareItemEffect = { energy: -999 };
    const resolver = () => drainEffect;

    const result = applySocialInteractions(
      { ...FULL_STATS, energy: 10 },
      [interaction('boost', 'drainer')],
      undefined,
      resolver,
    );

    expect(result.energy).toBe(STAT_MIN);
    expect(result.energy).toBe(1);
  });

  it('consolidateSocialInteractions applies the same resolver-driven effects and reports consumption', () => {
    const effect: CareItemEffect = { hygiene: 20 };
    const resolver = (itemId: string) => (itemId === 'hyg_soap' ? effect : undefined);

    const ix = interaction('clean', 'hyg_soap');
    const { stats, consumedCount, lastConsumed } = consolidateSocialInteractions(
      MID_STATS,
      [ix],
      undefined,
      resolver,
    );

    expect(stats).toEqual({ ...MID_STATS, hygiene: 70 });
    expect(consumedCount).toBe(1);
    expect(lastConsumed).toBe(ix);
  });

  it('no longer imports the Ditto shop catalog (blobbi-shop-items)', () => {
    expect(projectionSource).not.toContain('@/blobbi/shop/lib/blobbi-shop-items');
    expect(projectionSource).not.toContain('getShopItemById');
  });
});
