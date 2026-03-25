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
 * Registration data from BlobbiPage.
 */
export interface BlobbiActionsRegistration {
  /** The item use function */
  useItem: UseItemFunction;
  /** Whether an item use operation is currently in progress */
  isUsingItem: boolean;
}

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
  register: (registration: BlobbiActionsRegistration) => void;
  /** Unregister item-use functionality (called by BlobbiPage on unmount) */
  unregister: () => void;
  /** Current registration (null if not registered) */
  registration: BlobbiActionsRegistration | null;
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
 */
export function BlobbiActionsProvider({ children }: BlobbiActionsProviderProps) {
  const [registration, setRegistration] = useState<BlobbiActionsRegistration | null>(null);
  
  const register = useCallback((reg: BlobbiActionsRegistration) => {
    setRegistration(reg);
  }, []);
  
  const unregister = useCallback(() => {
    setRegistration(null);
  }, []);
  
  const value = useMemo<BlobbiActionsContextInternal>(() => ({
    register,
    unregister,
    registration,
  }), [register, unregister, registration]);
  
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
 */
export function useBlobbiActions(): BlobbiActionsContextValue {
  const context = useContext(BlobbiActionsContext);
  
  const canUseItems = context?.registration !== null && context?.registration !== undefined;
  const isUsingItem = context?.registration?.isUsingItem ?? false;
  
  const useItem = useCallback<UseItemFunction>(async (itemId, action, quantity = 1) => {
    if (!context?.registration) {
      console.warn('[BlobbiActions] Cannot use items - no registration active (BlobbiPage not mounted)');
      return {
        success: false,
        error: 'Item use not available - please visit Blobbi page first',
      };
    }
    
    return context.registration.useItem(itemId, action, quantity);
  }, [context?.registration]);
  
  // Debug log when context changes
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log('[BlobbiActions] Context state:', {
        hasContext: !!context,
        hasRegistration: !!context?.registration,
        canUseItems,
        isUsingItem,
      });
    }
  }, [context, canUseItems, isUsingItem]);
  
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
 */
export function useBlobbiActionsRegistration(
  useItem: UseItemFunction | null,
  isUsingItem: boolean
): void {
  const context = useContext(BlobbiActionsContext);
  const useItemRef = useRef(useItem);
  
  // Keep ref updated to avoid stale closures
  useEffect(() => {
    useItemRef.current = useItem;
  }, [useItem]);
  
  // Create a stable wrapper that uses the ref
  const stableUseItem = useCallback<UseItemFunction>(async (itemId, action, quantity) => {
    if (!useItemRef.current) {
      return {
        success: false,
        error: 'Item use function not available',
      };
    }
    return useItemRef.current(itemId, action, quantity);
  }, []);
  
  // Register/update when useItem or isUsingItem changes
  useEffect(() => {
    if (!context) {
      console.warn('[BlobbiActions] Cannot register - BlobbiActionsProvider not found in tree');
      return;
    }
    
    if (useItem) {
      context.register({
        useItem: stableUseItem,
        isUsingItem,
      });
      
      if (import.meta.env.DEV) {
        console.log('[BlobbiActions] Registered item-use function', { isUsingItem });
      }
    } else {
      context.unregister();
      
      if (import.meta.env.DEV) {
        console.log('[BlobbiActions] Unregistered (useItem is null)');
      }
    }
  }, [context, useItem, stableUseItem, isUsingItem]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (context) {
        context.unregister();
        
        if (import.meta.env.DEV) {
          console.log('[BlobbiActions] Unregistered on unmount');
        }
      }
    };
  }, [context]);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export { BlobbiActionsContext };
