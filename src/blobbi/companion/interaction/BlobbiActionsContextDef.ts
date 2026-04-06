/**
 * BlobbiActionsContextDef
 *
 * Lightweight context definition and types for the Blobbi actions system.
 * Separated from the provider component to avoid react-refresh warnings.
 */

import { createContext } from 'react';

import type { InventoryAction } from '@/blobbi/actions/lib/blobbi-action-utils';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Result of using an item via the context.
 */
export interface UseItemResult {
  /** Whether the use was successful */
  success: boolean;
  /** Stats that changed (key = stat name, value = delta) */
  statsChanged?: Record<string, number>;
  /** Error message if failed */
  error?: string;
}

/**
 * Function signature for using an item (always uses once).
 */
export type UseItemFunction = (
  itemId: string,
  action: InventoryAction,
) => Promise<UseItemResult>;

/**
 * Context value for Blobbi actions (consumer side).
 */
export interface BlobbiActionsContextValue {
  /**
   * Use an item on the current companion.
   * Works even without BlobbiPage registration (uses fallback).
   */
  useItem: UseItemFunction;

  /** Whether an item use operation is currently in progress */
  isUsingItem: boolean;

  /** Whether items can be used (companion exists and profile loaded) */
  canUseItems: boolean;

  /** Check if an item is on cooldown (recently attempted) */
  isItemOnCooldown: (itemId: string) => boolean;

  /** Clear cooldown for an item */
  clearItemCooldown: (itemId: string) => void;
}

/**
 * Internal context value (includes registration functions).
 */
export interface BlobbiActionsContextInternal {
  /** Register item-use functionality (called by BlobbiPage) */
  registerRef: React.MutableRefObject<UseItemFunction | null>;
  /** Whether items can currently be used (via registration) */
  canUseItemsRegisteredRef: React.MutableRefObject<boolean>;
  /** Whether an item is currently being used (via registration) */
  isUsingItemRegisteredRef: React.MutableRefObject<boolean>;
  /** Force update consumers (called sparingly) */
  notifyUpdate: () => void;
  /** Subscribe to updates */
  subscribe: (callback: () => void) => () => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

export const BlobbiActionsContext = createContext<BlobbiActionsContextInternal | null>(null);
