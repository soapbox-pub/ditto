import { type ReactNode, useRef } from 'react';
import { EventStoreContext } from '@/contexts/EventStoreContext';
import { NIndexedDBStore } from '@/lib/NIndexedDBStore';

/**
 * Provides the app-wide IndexedDB event store (see `NIndexedDBStore`).
 *
 * The store is opened once and the resulting promise is shared through
 * context for the lifetime of the provider, so the IndexedDB availability
 * check and `open()` run only once.
 */
export function EventStoreProvider({ children }: { children: ReactNode }) {
  const store = useRef<Promise<NIndexedDBStore>>(undefined);
  store.current ??= NIndexedDBStore.open();

  return (
    <EventStoreContext.Provider value={store.current}>
      {children}
    </EventStoreContext.Provider>
  );
}
