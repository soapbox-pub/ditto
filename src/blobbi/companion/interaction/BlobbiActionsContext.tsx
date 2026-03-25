/**
 * BlobbiActionsContext
 * 
 * Provides item use functionality to the companion interaction system.
 * This context bridges the gap between the companion UI (which shows
 * falling items) and the Blobbi action system (which actually uses items).
 * 
 * Architecture:
 * - BlobbiActionsProvider is mounted at the app level (wraps BlobbiCompanionLayer)
 * - BlobbiPage registers its item-use function when mounted via useBlobbiActionsRegistration
 * - BlobbiCompanionLayer uses useBlobbiActions to access the registered functions
 * 
 * This allows the floating companion to use items regardless of which page
 * the user is on, as long as BlobbiPage has been visited and is still mounted.
 * 
 * Performance considerations:
 * - Registration uses refs to avoid triggering re-renders on every state change
 * - Consumer hook returns stable identities to prevent cascading re-renders
 * - Debug logs are gated behind DEV and only log on actual state changes
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

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
 * Context value for Blobbi actions (consumer side).
 */
export interface BlobbiActionsContextValue {
  /**
   * Use an inventory item on the current companion.
   * Returns failure if no registration is active.
   */
  useItem: UseItemFunction;
  
  /** Whether an item use operation is currently in progress */
  isUsingItem: boolean;
  
  /** Whether items can be used (BlobbiPage is mounted and has companion/profile) */
  canUseItems: boolean;
}

/**
 * Internal context value (includes registration functions).
 */
interface BlobbiActionsContextInternal {
  /** Register item-use functionality (called by BlobbiPage) */
  registerRef: React.MutableRefObject<UseItemFunction | null>;
  /** Whether items can currently be used */
  canUseItemsRef: React.MutableRefObject<boolean>;
  /** Whether an item is currently being used */
  isUsingItemRef: React.MutableRefObject<boolean>;
  /** Force update consumers (called sparingly) */
  notifyUpdate: () => void;
  /** Subscribe to updates */
  subscribe: (callback: () => void) => () => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const BlobbiActionsContext = createContext<BlobbiActionsContextInternal | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

interface BlobbiActionsProviderProps {
  children: ReactNode;
}

/**
 * Provider for Blobbi actions context.
 * 
 * Should be placed at the app level, wrapping BlobbiCompanionLayer.
 * BlobbiPage will register its item-use function when mounted.
 * 
 * Uses refs instead of state to avoid triggering re-renders on every registration update.
 */
export function BlobbiActionsProvider({ children }: BlobbiActionsProviderProps) {
  // Use refs to store registration data - avoids re-renders on every update
  const registerRef = useRef<UseItemFunction | null>(null);
  const canUseItemsRef = useRef<boolean>(false);
  const isUsingItemRef = useRef<boolean>(false);
  
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
    canUseItemsRef,
    isUsingItemRef,
    notifyUpdate,
    subscribe,
  }), [notifyUpdate, subscribe]);
  
  return (
    <BlobbiActionsContext.Provider value={value}>
      {children}
    </BlobbiActionsContext.Provider>
  );
}

// ─── Consumer Hook ────────────────────────────────────────────────────────────

/**
 * Hook to access Blobbi actions from any component (e.g., BlobbiCompanionLayer).
 * 
 * Returns the context value with the registered item-use function,
 * or a no-op if no registration is active.
 * 
 * Uses subscription pattern to only re-render when necessary.
 */
export function useBlobbiActions(): BlobbiActionsContextValue {
  const context = useContext(BlobbiActionsContext);
  
  // Force re-render counter (only used when registration changes)
  const [, forceUpdate] = useState(0);
  
  // Subscribe to updates
  useEffect(() => {
    if (!context) return;
    return context.subscribe(() => {
      forceUpdate(c => c + 1);
    });
  }, [context]);
  
  // Create stable useItem function that reads from ref
  const useItem = useCallback<UseItemFunction>(async (itemId, action, quantity = 1) => {
    if (!context?.registerRef.current) {
      if (import.meta.env.DEV) {
        console.warn('[BlobbiActions] Cannot use items - no registration active');
      }
      return {
        success: false,
        error: 'Item use not available - please visit Blobbi page first',
      };
    }
    
    return context.registerRef.current(itemId, action, quantity);
  }, [context]);
  
  // Read current values from refs
  const canUseItems = context?.canUseItemsRef.current ?? false;
  const isUsingItem = context?.isUsingItemRef.current ?? false;
  
  // Return stable object (only useItem is truly stable, the booleans may differ)
  return useMemo(() => ({
    useItem,
    isUsingItem,
    canUseItems,
  }), [useItem, isUsingItem, canUseItems]);
}

// ─── Registration Hook ────────────────────────────────────────────────────────

/**
 * Hook for BlobbiPage to register its item-use function.
 * 
 * Call this in BlobbiPage with the current useItem function and isUsingItem state.
 * The registration will be automatically cleaned up on unmount.
 * 
 * Uses refs to avoid triggering re-renders in consumers on every prop change.
 */
export function useBlobbiActionsRegistration(
  useItemFn: UseItemFunction | null,
  isUsingItem: boolean
): void {
  const context = useContext(BlobbiActionsContext);
  
  // Track previous values to detect actual changes
  const prevCanUseRef = useRef<boolean>(false);
  
  // Keep useItemFn in a ref to avoid stale closures
  const useItemRef = useRef(useItemFn);
  useItemRef.current = useItemFn;
  
  // Create a stable wrapper that delegates to the ref
  const stableUseItem = useCallback<UseItemFunction>(async (itemId, action, quantity = 1) => {
    if (!useItemRef.current) {
      return {
        success: false,
        error: 'Item use function not available',
      };
    }
    return useItemRef.current(itemId, action, quantity);
  }, []);
  
  // Update refs and notify only when canUseItems actually changes
  useEffect(() => {
    if (!context) {
      if (import.meta.env.DEV) {
        console.warn('[BlobbiActions] Cannot register - BlobbiActionsProvider not found');
      }
      return;
    }
    
    const canUseItems = useItemFn !== null;
    
    // Update refs
    context.registerRef.current = canUseItems ? stableUseItem : null;
    context.canUseItemsRef.current = canUseItems;
    context.isUsingItemRef.current = isUsingItem;
    
    // Only notify consumers if canUseItems changed (major state change)
    if (prevCanUseRef.current !== canUseItems) {
      prevCanUseRef.current = canUseItems;
      context.notifyUpdate();
      
      if (import.meta.env.DEV) {
        console.log('[BlobbiActions] Registration changed:', { canUseItems, isUsingItem });
      }
    }
  }, [context, useItemFn, stableUseItem, isUsingItem]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (context) {
        context.registerRef.current = null;
        context.canUseItemsRef.current = false;
        context.isUsingItemRef.current = false;
        context.notifyUpdate();
        
        if (import.meta.env.DEV) {
          console.log('[BlobbiActions] Unregistered on unmount');
        }
      }
    };
  }, [context]);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export { BlobbiActionsContext };
