import { useContext } from 'react';
import { NostrStorageContext, type NostrStorageContextType } from '@/contexts/NostrStorageContext';

/**
 * Access the app-wide IndexedDB event store.
 *
 * Returns an `NIndexedDB`. Its connection may still be opening, but every
 * method awaits it internally, so you can call methods directly:
 *
 * ```ts
 * const store = useNostrStorage();
 * // …
 * await store.event(event);
 * ```
 */
export function useNostrStorage(): NostrStorageContextType {
  const context = useContext(NostrStorageContext);
  if (!context) {
    throw new Error('useNostrStorage must be used within a NostrProvider');
  }
  return context;
}
