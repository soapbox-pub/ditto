import { type ReactNode, useContext, useRef } from 'react';
import { NostrStorageContext } from '@/contexts/NostrStorageContext';
import { NIndexedDB } from '@/lib/NIndexedDB';

/**
 * Provides the app-wide IndexedDB event store (see `NIndexedDB`).
 *
 * `NostrProvider` already opens the store and provides it through
 * `NostrStorageContext` (the batcher needs it to mirror relay results). When
 * this component is rendered inside a `NostrProvider`, it reuses that existing
 * store rather than opening a second connection. It only opens its own store
 * when no parent has provided one — preserving its use as a standalone
 * provider.
 *
 * The store is opened once and the resulting promise is shared through
 * context for the lifetime of the provider, so the IndexedDB availability
 * check and `open()` run only once.
 */
export function NostrStorageProvider({ children }: { children: ReactNode }) {
  const parentStore = useContext(NostrStorageContext);

  const store = useRef<Promise<NIndexedDB>>(undefined);
  store.current ??= NIndexedDB.open();

  return (
    <NostrStorageContext.Provider value={parentStore ?? store.current}>
      {children}
    </NostrStorageContext.Provider>
  );
}
