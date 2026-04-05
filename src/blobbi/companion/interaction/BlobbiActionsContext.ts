/**
 * BlobbiActionsContext - Consumer Hooks
 *
 * Contains the heavy consumer hooks (useBlobbiActions, useBlobbiActionsRegistration)
 * that depend on useBlobbiItemUse and the full Blobbi action system.
 *
 * The lightweight provider component lives in BlobbiActionsProvider.tsx so it
 * can be imported at the app root without pulling in ~450K of Blobbi code.
 *
 * Re-exports everything from BlobbiActionsProvider.tsx for backward compatibility.
 */

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useBlobbiItemUse } from './useBlobbiItemUse';
import {
  BlobbiActionsContext,
  type UseItemFunction,
  type UseItemResult,
  type BlobbiActionsContextValue,
  type BlobbiActionsContextInternal,
} from './BlobbiActionsContextDef';

// Re-export types and context from the def module for backward compatibility
export {
  BlobbiActionsContext,
  type UseItemFunction,
  type UseItemResult,
  type BlobbiActionsContextValue,
  type BlobbiActionsContextInternal,
};

// ─── Consumer Hook ────────────────────────────────────────────────────────────

/**
 * Hook to access Blobbi actions from any component (e.g., BlobbiCompanionLayer).
 * 
 * Returns the context value with item-use functionality.
 * Uses:
 * 1. Registered function from BlobbiPage (if available) - better cache access
 * 2. Built-in useBlobbiItemUse hook as fallback - works anywhere
 * 
 * Uses subscription pattern to only re-render when necessary.
 */
export function useBlobbiActions(): BlobbiActionsContextValue {
  const context = useContext(BlobbiActionsContext);
  
  // Built-in fallback item use hook
  const fallbackItemUse = useBlobbiItemUse();
  
  // Force re-render counter (only used when registration changes)
  const [, forceUpdate] = useState(0);
  
  // Subscribe to updates
  useEffect(() => {
    if (!context) return;
    return context.subscribe(() => {
      forceUpdate(c => c + 1);
    });
  }, [context]);
  
  // Create stable useItem function that:
  // 1. Uses registered function if available (from BlobbiPage)
  // 2. Falls back to built-in hook if no registration
  const useItem = useCallback<UseItemFunction>(async (itemId, action, quantity = 1) => {
    // Try registered function first (from BlobbiPage)
    if (context?.registerRef.current) {
      if (import.meta.env.DEV) {
        console.log('[BlobbiActions] Using registered item-use function');
      }
      return context.registerRef.current(itemId, action, quantity);
    }
    
    // Check if fallback can handle it
    if (!fallbackItemUse.canUseItems) {
      if (import.meta.env.DEV) {
        console.warn('[BlobbiActions] Cannot use items - no companion selected');
      }
      return {
        success: false,
        error: 'No companion selected. Please select a Blobbi as your companion first.',
      };
    }
    
    // Use fallback
    if (import.meta.env.DEV) {
      console.log('[BlobbiActions] Using fallback item-use hook');
    }
    return fallbackItemUse.useItem(itemId, action, quantity);
  }, [context, fallbackItemUse]);
  
  // Determine canUseItems: true if registered OR fallback can use
  const hasRegistration = context?.canUseItemsRegisteredRef.current ?? false;
  const canUseItems = hasRegistration || fallbackItemUse.canUseItems;
  
  // Determine isUsingItem: true if either source is using
  const registeredIsUsing = context?.isUsingItemRegisteredRef.current ?? false;
  const isUsingItem = registeredIsUsing || fallbackItemUse.isUsingItem;
  
  // Return stable object
  return useMemo(() => ({
    useItem,
    isUsingItem,
    canUseItems,
    isItemOnCooldown: fallbackItemUse.isItemOnCooldown,
    clearItemCooldown: fallbackItemUse.clearItemCooldown,
  }), [useItem, isUsingItem, canUseItems, fallbackItemUse.isItemOnCooldown, fallbackItemUse.clearItemCooldown]);
}

// ─── Registration Hook ────────────────────────────────────────────────────────

/**
 * Hook for BlobbiPage to register its item-use function.
 * 
 * Call this in BlobbiPage with the current useItem function and isUsingItem state.
 * The registration will be automatically cleaned up on unmount.
 * 
 * When registered, BlobbiPage's item-use function takes priority over the fallback.
 * This is preferred when on /blobbi because BlobbiPage has better cache access.
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
    context.canUseItemsRegisteredRef.current = canUseItems;
    context.isUsingItemRegisteredRef.current = isUsingItem;
    
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
        context.canUseItemsRegisteredRef.current = false;
        context.isUsingItemRegisteredRef.current = false;
        context.notifyUpdate();
        
        if (import.meta.env.DEV) {
          console.log('[BlobbiActions] Unregistered on unmount');
        }
      }
    };
  }, [context]);
}


