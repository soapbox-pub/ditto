import { useContext } from 'react';
import { NostrStorageContext, type EventStoreContextType } from '@/contexts/NostrStorageContext';

/**
 * Access the app-wide IndexedDB event store.
 *
 * Returns a `Promise<NIndexedDB>`; `await` it inside a query function:
 *
 * ```ts
 * const eventStore = useEventStore();
 * // …
 * const store = await eventStore;
 * await store.event(event);
 * ```
 */
export function useEventStore(): EventStoreContextType {
  const context = useContext(NostrStorageContext);
  if (!context) {
    throw new Error('useEventStore must be used within an NostrStorageProvider');
  }
  return context;
}
