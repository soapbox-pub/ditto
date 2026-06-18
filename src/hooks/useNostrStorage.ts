import { useContext } from 'react';
import { NostrStorageContext } from '@/contexts/NostrStorageContext';
import type { NIndexedDB } from '@/lib/NIndexedDB';

/**
 * Access the app-wide IndexedDB event store.
 *
 * Returns `{ store }`, where `store` is an `NIndexedDB`. Its connection may
 * still be opening, but every method awaits it internally, so you can call
 * methods directly:
 *
 * ```ts
 * const { store } = useNostrStorage();
 * // …
 * await store.event(event);
 * ```
 */
export function useNostrStorage(): { store: NIndexedDB } {
  const store = useContext(NostrStorageContext);
  if (!store) {
    throw new Error('useNostrStorage must be used within a NostrProvider');
  }
  return { store };
}
