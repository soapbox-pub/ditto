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

import { useCallback, useMemo, useRef, type ReactNode } from 'react';

import {
  BlobbiActionsContext,
  type UseItemFunction,
  type BlobbiActionsContextInternal,
} from './BlobbiActionsContextDef';

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
    notifyUpdate,
    subscribe,
  }), [notifyUpdate, subscribe]);

  return (
    <BlobbiActionsContext.Provider value={value}>
      {children}
    </BlobbiActionsContext.Provider>
  );
}
