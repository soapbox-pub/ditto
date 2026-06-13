import { useContext } from 'react';
import { EventStoreContext, type EventStoreContextType } from '@/contexts/EventStoreContext';

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
  const context = useContext(EventStoreContext);
  if (!context) {
    throw new Error('useEventStore must be used within an EventStoreProvider');
  }
  return context;
}
