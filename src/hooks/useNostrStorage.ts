import { useContext } from 'react';
import { NostrStorageContext, type NostrStorageContextType } from '@/contexts/NostrStorageContext';

/**
 * Access the app-wide IndexedDB event store.
 *
 * Returns a `Promise<NIndexedDB>`; `await` it inside a query function:
 *
 * ```ts
 * const eventStore = useNostrStorage();
 * // …
 * const store = await eventStore;
 * await store.event(event);
 * ```
 */
export function useNostrStorage(): NostrStorageContextType {
  const context = useContext(NostrStorageContext);
  if (!context) {
    throw new Error('useNostrStorage must be used within an NostrStorageProvider');
  }
  return context;
}
