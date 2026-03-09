// src/types/shop.ts

/**
 * Shop item category
 */
export type ShopItemCategory = 
  | 'food' 
  | 'toy' 
  | 'medicine' 
  | 'hygiene' 
  | 'accessory';

/**
 * Stat effects that items can apply
 */
export interface ItemEffect {
  hunger?: number;
  happiness?: number;
  energy?: number;
  hygiene?: number;
  health?: number;
  // Egg-specific effects
  egg_temperature?: number;
  shell_integrity?: number;
}

/**
 * Shop item definition
 */
export interface ShopItem {
  id: string;
  name: string;
  type: ShopItemCategory;
  price: number;
  icon: string;
  effect?: ItemEffect;
  status?: 'live' | 'disabled';
}

/**
 * Stored item in user's profile inventory
 */
export interface StorageItem {
  itemId: string;   // Must match a ShopItem.id
  quantity: number; // Must be >= 1
}

/**
 * Purchase request payload
 */
export interface PurchaseRequest {
  itemId: string;
  price: number;    // Single item price (for validation)
  quantity: number; // Number of items to purchase
}
