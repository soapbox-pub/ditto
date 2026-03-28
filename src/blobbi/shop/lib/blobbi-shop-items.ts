// src/blobbi/shop/lib/blobbi-shop-items.ts

import type { ShopItem, ShopItemCategory } from '../types/shop.types';

/**
 * Complete shop item catalog for the Blobbi Shop.
 * Based on the specification from /docs/blobbi/blobbi-shop-spec.md
 */
export const BLOBBI_SHOP_ITEMS: ShopItem[] = [
  // ─── Food Items ─────────────────────────────────────────────────────────────
  {
    id: 'food_apple',
    name: 'Apple',
    type: 'food',
    price: 10,
    icon: '🍎',
    effect: { hunger: 15, hygiene: -2, energy: 5 },
    status: 'live',
  },
  {
    id: 'food_burger',
    name: 'Burger',
    type: 'food',
    price: 25,
    icon: '🍔',
    effect: { hunger: 40, happiness: 10, hygiene: -8, energy: 8 },
    status: 'live',
  },
  {
    id: 'food_cake',
    name: 'Cake',
    type: 'food',
    price: 50,
    icon: '🎂',
    effect: { hunger: 20, happiness: 30, hygiene: -10, energy: 10 },
    status: 'live',
  },
  {
    id: 'food_pizza',
    name: 'Pizza',
    type: 'food',
    price: 35,
    icon: '🍕',
    effect: { hunger: 35, happiness: 15, hygiene: -9, energy: 10 },
    status: 'live',
  },
  {
    id: 'food_sushi',
    name: 'Sushi',
    type: 'food',
    price: 45,
    icon: '🍣',
    effect: { hunger: 30, health: 10, hygiene: -6, energy: 7 },
    status: 'live',
  },

  // ─── Toy Items ──────────────────────────────────────────────────────────────
  {
    id: 'toy_ball',
    name: 'Ball',
    type: 'toy',
    price: 30,
    icon: '⚽',
    effect: { happiness: 25, energy: -10, hygiene: -5 },
    status: 'live',
  },
  {
    id: 'toy_teddy',
    name: 'Teddy Bear',
    type: 'toy',
    price: 60,
    icon: '🧸',
    effect: { happiness: 40, energy: -15 },
    status: 'live',
  },
  {
    id: 'toy_blocks',
    name: 'Building Blocks',
    type: 'toy',
    price: 40,
    icon: '🧱',
    effect: { happiness: 30, energy: -10 },
    status: 'live',
  },

  // ─── Medicine Items ─────────────────────────────────────────────────────────
  {
    id: 'med_vitamins',
    name: 'Vitamins',
    type: 'medicine',
    price: 40,
    icon: '💊',
    effect: { health: 20 },
    status: 'live',
  },
  {
    id: 'med_super',
    name: 'Super Medicine',
    type: 'medicine',
    price: 100,
    icon: '💉',
    effect: { health: 50, energy: 20, happiness: -10 },
    status: 'live',
  },
  {
    id: 'med_bandage',
    name: 'Bandage',
    type: 'medicine',
    price: 20,
    icon: '🩹',
    effect: { health: 15 },
    status: 'live',
  },
  {
    id: 'med_elixir',
    name: 'Health Elixir',
    type: 'medicine',
    price: 150,
    icon: '🧪',
    effect: { health: 80, happiness: 20, energy: 10 },
    status: 'live',
  },
  {
    id: 'med_shell_repair',
    name: 'Shell Repair Kit',
    type: 'medicine',
    price: 60,
    icon: '🥚',
    effect: { health: 30 },
    status: 'live',
  },
  {
    id: 'med_calcium',
    name: 'Calcium Supplement',
    type: 'medicine',
    price: 35,
    icon: '🦴',
    effect: { health: 35 },
    status: 'live',
  },

  // ─── Hygiene Items ──────────────────────────────────────────────────────────
  {
    id: 'hyg_soap',
    name: 'Soap',
    type: 'hygiene',
    price: 15,
    icon: '🧼',
    effect: { hygiene: 30 },
    status: 'live',
  },
  {
    id: 'hyg_shampoo',
    name: 'Shampoo',
    type: 'hygiene',
    price: 25,
    icon: '🧴',
    effect: { hygiene: 50, happiness: 10 },
    status: 'live',
  },
  {
    id: 'hyg_bubble',
    name: 'Bubble Bath',
    type: 'hygiene',
    price: 40,
    icon: '🛁',
    effect: { hygiene: 60, happiness: 20 },
    status: 'live',
  },
  {
    id: 'hyg_towel',
    name: 'Soft Towel',
    type: 'hygiene',
    price: 20,
    icon: '🏖️',
    effect: { hygiene: 25, happiness: 5 },
    status: 'live',
  },

  // ─── Accessory Items (Disabled) ─────────────────────────────────────────────
  {
    id: 'acc_hat',
    name: 'Party Hat',
    type: 'accessory',
    price: 75,
    icon: '🎩',
    status: 'disabled',
  },
  {
    id: 'acc_glasses',
    name: 'Cool Glasses',
    type: 'accessory',
    price: 60,
    icon: '🕶️',
    status: 'disabled',
  },
  {
    id: 'acc_bow',
    name: 'Bow Tie',
    type: 'accessory',
    price: 50,
    icon: '🎀',
    status: 'disabled',
  },
  {
    id: 'acc_crown',
    name: 'Crown',
    type: 'accessory',
    price: 100,
    icon: '👑',
    status: 'disabled',
  },
];

/**
 * Get a shop item by its ID
 */
export function getShopItemById(id: string): ShopItem | undefined {
  return BLOBBI_SHOP_ITEMS.find(item => item.id === id);
}

/**
 * Get all shop items for a specific category
 */
export function getShopItemsByType(type: ShopItemCategory): ShopItem[] {
  return BLOBBI_SHOP_ITEMS.filter(item => item.type === type);
}

/**
 * Get all live (non-disabled) shop items
 */
export function getLiveShopItems(): ShopItem[] {
  return BLOBBI_SHOP_ITEMS.filter(item => item.status === 'live');
}

/**
 * Get all shop item categories with their counts
 */
export function getShopCategories(): Array<{ type: ShopItemCategory; count: number; label: string }> {
  const categories: ShopItemCategory[] = ['food', 'toy', 'medicine', 'hygiene', 'accessory'];
  
  return categories.map(type => ({
    type,
    count: getShopItemsByType(type).length,
    label: type.charAt(0).toUpperCase() + type.slice(1),
  }));
}
