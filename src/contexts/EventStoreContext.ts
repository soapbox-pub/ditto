import { createContext } from 'react';
import type { NIndexedDBStore } from '@/lib/NIndexedDBStore';

/**
 * The event store is opened asynchronously, so the context carries a
 * `Promise<NIndexedDBStore>` rather than the store itself. Consumers `await`
 * it inside their query functions — the promise resolves once IndexedDB is
 * open (or immediately to a no-op store when IndexedDB is unavailable).
 */
export type EventStoreContextType = Promise<NIndexedDBStore>;

export const EventStoreContext = createContext<EventStoreContextType | null>(null);
