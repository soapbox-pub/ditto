/**
 * BlobbiActionsProvider (lightweight)
 *
 * This file contains ONLY the context definition and provider component.
 * It has zero heavy dependencies so it can be imported at the app root
 * without pulling in the full Blobbi action system (~450K).
 *
 * Consumer hooks (useBlobbiActions, useBlobbiActionsRegistration) live in
 * BlobbiActionsContext.tsx and are only loaded by the companion layer or
 * BlobbiPage, both of which are lazy-loaded.
 */

import { createContext, useCallback, useMemo, useRef, type ReactNode } from 'react';

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
 * Function signature for using an item.
 */
export type UseItemFunction = (
  itemId: string,
  action: InventoryAction,
  quantity?: number
) => Promise<UseItemResult>;

/**
 * Function signature for toggling sleep/wake state.
 * Returns a promise that resolves when the state change is published.
 */
export type ToggleSleepFunction = () => Promise<void>;

/**
 * Context value for Blobbi actions (consumer side).
 */
export interface BlobbiActionsContextValue {
  /**
   * Use an inventory item on the current companion.
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

  /**
   * Toggle sleep/wake state on the current companion.
   * Only available when BlobbiPage has registered its handler.
   */
  toggleSleep: ToggleSleepFunction | null;
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
  /** Registered sleep/wake toggle function (from BlobbiPage) */
  toggleSleepRef: React.MutableRefObject<ToggleSleepFunction | null>;
  /** Force update consumers (called sparingly) */
  notifyUpdate: () => void;
  /** Subscribe to updates */
  subscribe: (callback: () => void) => () => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

export const BlobbiActionsContext = createContext<BlobbiActionsContextInternal | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

interface BlobbiActionsProviderProps {
  children: ReactNode;
}

/**
 * Provider for Blobbi actions context.
 *
 * Should be placed at the app level, wrapping BlobbiCompanionLayer.
 * BlobbiPage can register its item-use function when mounted, but
 * item use will work even without registration (uses built-in hook).
 *
 * Uses refs instead of state to avoid triggering re-renders on every registration update.
 */
export function BlobbiActionsProvider({ children }: BlobbiActionsProviderProps) {
  // Use refs to store registration data - avoids re-renders on every update
  const registerRef = useRef<UseItemFunction | null>(null);
  const canUseItemsRegisteredRef = useRef<boolean>(false);
  const isUsingItemRegisteredRef = useRef<boolean>(false);
  const toggleSleepRef = useRef<ToggleSleepFunction | null>(null);

  // Subscribers for manual notification
  const subscribersRef = useRef<Set<() => void>>(new Set());

  const subscribe = useCallback((callback: () => void) => {
    subscribersRef.current.add(callback);
    return () => {
      subscribersRef.current.delete(callback);
    };
  }, []);

  const notifyUpdate = useCallback(() => {
    subscribersRef.current.forEach(cb => cb());
  }, []);

  // Stable context value - never changes identity
  const value = useMemo<BlobbiActionsContextInternal>(() => ({
    registerRef,
    canUseItemsRegisteredRef,
    isUsingItemRegisteredRef,
    toggleSleepRef,
    notifyUpdate,
    subscribe,
  }), [notifyUpdate, subscribe]);

  return (
    <BlobbiActionsContext.Provider value={value}>
      {children}
    </BlobbiActionsContext.Provider>
  );
}
