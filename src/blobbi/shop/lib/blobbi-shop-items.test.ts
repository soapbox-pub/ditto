import { describe, it, expect } from 'vitest';

import { getShopItemById } from './blobbi-shop-items';
import { applyItemEffects } from '@/blobbi/actions/lib/blobbi-action-utils';
import { DIRECT_ACTION_HAPPINESS_EFFECTS } from '@/blobbi/actions/hooks/useBlobbiDirectAction';
import type { BlobbiStats } from '@/blobbi/core/lib/blobbi';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FULL: BlobbiStats = { hunger: 100, happiness: 100, health: 100, hygiene: 100, energy: 100 };
const LOW: BlobbiStats = { hunger: 25, happiness: 25, health: 25, hygiene: 25, energy: 25 };

function effectOf(id: string) {
  const item = getShopItemById(id);
  if (!item?.effect) throw new Error(`Item or effect not found: ${id}`);
  return item.effect;
}

// ─── Food items ───────────────────────────────────────────────────────────────

describe('food item effects', () => {
  it('Apple restores +25 hunger (1 baby segment)', () => {
    const effect = effectOf('food_apple');
    expect(effect.hunger).toBe(25);
    expect(effect.energy).toBe(5);
    expect(effect.hygiene).toBe(-2);
  });

  it('Burger restores +45 hunger with multi-stat bonus', () => {
    const effect = effectOf('food_burger');
    expect(effect.hunger).toBe(45);
    expect(effect.happiness).toBe(10);
    expect(effect.energy).toBe(8);
    expect(effect.hygiene).toBe(-8);
  });

  it('Sushi restores +35 hunger and +10 health', () => {
    const effect = effectOf('food_sushi');
    expect(effect.hunger).toBe(35);
    expect(effect.health).toBe(10);
    expect(effect.hygiene).toBe(-5);
  });

  it('Cake is happiness-focused food (+25 hunger, +30 happiness)', () => {
    const effect = effectOf('food_cake');
    expect(effect.hunger).toBe(25);
    expect(effect.happiness).toBe(30);
  });
});

// ─── Toy items ────────────────────────────────────────────────────────────────

describe('toy item effects', () => {
  it('Ball is basic toy (+25 happiness, costs energy and hygiene)', () => {
    const effect = effectOf('toy_ball');
    expect(effect.happiness).toBe(25);
    expect(effect.energy).toBe(-10);
    expect(effect.hygiene).toBe(-5);
  });

  it('Teddy Bear is premium toy with low energy cost', () => {
    const effect = effectOf('toy_teddy');
    expect(effect.happiness).toBe(45);
    expect(effect.energy).toBe(-5);
  });

  it('Teddy costs less energy than Ball', () => {
    const teddy = effectOf('toy_teddy');
    const ball = effectOf('toy_ball');
    // Teddy is premium — more happiness, less energy cost
    expect(teddy.happiness!).toBeGreaterThan(ball.happiness!);
    expect(teddy.energy!).toBeGreaterThan(ball.energy!); // -5 > -10
  });
});

// ─── Medicine items ───────────────────────────────────────────────────────────

describe('medicine item effects', () => {
  it('Bandage restores +25 health (1 baby segment)', () => {
    expect(effectOf('med_bandage').health).toBe(25);
  });

  it('Vitamins restore health and energy', () => {
    const effect = effectOf('med_vitamins');
    expect(effect.health).toBe(25);
    expect(effect.energy).toBe(5);
  });

  it('Health Elixir is premium (+75 health, +20 happiness, +10 energy)', () => {
    const effect = effectOf('med_elixir');
    expect(effect.health).toBe(75);
    expect(effect.happiness).toBe(20);
    expect(effect.energy).toBe(10);
  });

  it('Super Medicine has happiness tradeoff', () => {
    const effect = effectOf('med_super');
    expect(effect.health).toBe(50);
    expect(effect.happiness).toBe(-10);
  });
});

// ─── Hygiene items ────────────────────────────────────────────────────────────

describe('hygiene item effects', () => {
  it('Soap restores +25 hygiene (1 baby segment)', () => {
    const effect = effectOf('hyg_soap');
    expect(effect.hygiene).toBe(25);
    expect(effect.happiness).toBeUndefined();
  });

  it('Bubble Bath restores +70 hygiene and +25 happiness', () => {
    const effect = effectOf('hyg_bubble');
    expect(effect.hygiene).toBe(70);
    expect(effect.happiness).toBe(25);
  });

  it('Shampoo is mid-tier (+50 hygiene, +10 happiness)', () => {
    const effect = effectOf('hyg_shampoo');
    expect(effect.hygiene).toBe(50);
    expect(effect.happiness).toBe(10);
  });
});

// ─── Direct actions ───────────────────────────────────────────────────────────

describe('direct action effects', () => {
  it('play_music gives +15 happiness', () => {
    expect(DIRECT_ACTION_HAPPINESS_EFFECTS.play_music).toBe(15);
  });

  it('sing gives +20 happiness', () => {
    expect(DIRECT_ACTION_HAPPINESS_EFFECTS.sing).toBe(20);
  });

  it('sing is stronger than play_music', () => {
    expect(DIRECT_ACTION_HAPPINESS_EFFECTS.sing).toBeGreaterThan(
      DIRECT_ACTION_HAPPINESS_EFFECTS.play_music,
    );
  });
});

// ─── applyItemEffects clamping ────────────────────────────────────────────────

describe('applyItemEffects clamping', () => {
  it('stats clamp to 100 when effect would exceed', () => {
    const result = applyItemEffects(FULL, effectOf('food_apple'));
    expect(result.hunger).toBe(100);
    expect(result.energy).toBe(100);
    expect(result.hygiene).toBe(98); // 100 + (-2) = 98
  });

  it('stats clamp to 1 when effect would go below', () => {
    const result = applyItemEffects(
      { hunger: 1, happiness: 1, health: 1, hygiene: 1, energy: 1 },
      effectOf('toy_ball'),
    );
    // happiness: 1 + 25 = 26
    // energy: 1 + (-10) = clamped to 1
    // hygiene: 1 + (-5) = clamped to 1
    expect(result.happiness).toBe(26);
    expect(result.energy).toBe(1);
    expect(result.hygiene).toBe(1);
  });

  it('Bubble Bath from low hygiene restores substantially', () => {
    const result = applyItemEffects(LOW, effectOf('hyg_bubble'));
    // hygiene: 25 + 70 = 95
    // happiness: 25 + 25 = 50
    expect(result.hygiene).toBe(95);
    expect(result.happiness).toBe(50);
  });
});
