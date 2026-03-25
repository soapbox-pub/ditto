/**
 * BlobbiActionsContext
 * 
 * Provides item use functionality to the companion interaction system.
 * This context bridges the gap between the companion UI (which shows
 * falling items) and the Blobbi action system (which actually uses items).
 * 
 * The context must be provided by a parent component that has access to:
 * - The current companion state
 * - The Blobbi profile (with inventory)
 * - The item use mutation
 * 
 * Typically provided by BlobbiPage or similar container.
 */

import { createContext, useContext, type ReactNode } from 'react';

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
 * Context value for Blobbi actions.
 */
export interface BlobbiActionsContextValue {
  /**
   * Use an inventory item on the current companion.
   * 
   * @param itemId - The shop item ID to use
   * @param action - The action type (feed, play, medicine, clean)
   * @param quantity - Number of items to use (default 1)
   * @returns Result of the use attempt
   */
  useItem: (
    itemId: string,
    action: InventoryAction,
    quantity?: number
  ) => Promise<UseItemResult>;
  
  /** Whether an item use operation is currently in progress */
  isUsingItem: boolean;
  
  /** Whether items can be used (companion and profile available) */
  canUseItems: boolean;
}

/**
 * Default context value (no-op, used when context not provided).
 */
const defaultContextValue: BlobbiActionsContextValue = {
  useItem: async () => ({
    success: false,
    error: 'BlobbiActionsContext not provided',
  }),
  isUsingItem: false,
  canUseItems: false,
};

// ─── Context ──────────────────────────────────────────────────────────────────

const BlobbiActionsContext = createContext<BlobbiActionsContextValue>(defaultContextValue);

// ─── Provider ─────────────────────────────────────────────────────────────────

interface BlobbiActionsProviderProps {
  children: ReactNode;
  value: BlobbiActionsContextValue;
}

/**
 * Provider for Blobbi actions context.
 * 
 * Should be placed by a component that has access to:
 * - useBlobbiUseInventoryItem hook
 * - Current companion state
 * - Profile/inventory data
 * 
 * Example usage:
 * ```tsx
 * // In BlobbiPage or similar:
 * const { mutateAsync: executeUseItem, isPending } = useBlobbiUseInventoryItem({...});
 * 
 * const actionsValue: BlobbiActionsContextValue = {
 *   useItem: async (itemId, action, quantity = 1) => {
 *     try {
 *       const result = await executeUseItem({ itemId, action, quantity });
 *       return { success: true, statsChanged: result.statsChanged };
 *     } catch (error) {
 *       return { success: false, error: error.message };
 *     }
 *   },
 *   isUsingItem: isPending,
 *   canUseItems: !!companion && !!profile,
 * };
 * 
 * return (
 *   <BlobbiActionsProvider value={actionsValue}>
 *     <BlobbiCompanionLayer />
 *   </BlobbiActionsProvider>
 * );
 * ```
 */
export function BlobbiActionsProvider({ children, value }: BlobbiActionsProviderProps) {
  return (
    <BlobbiActionsContext.Provider value={value}>
      {children}
    </BlobbiActionsContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Hook to access Blobbi actions from any component.
 * 
 * Returns the context value or a default no-op value if context not provided.
 */
export function useBlobbiActions(): BlobbiActionsContextValue {
  return useContext(BlobbiActionsContext);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export { BlobbiActionsContext };
