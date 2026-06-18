import { createContext } from 'react';
import type { NIndexedDB } from '@/lib/NIndexedDB';

/**
 * The app-wide IndexedDB event store. Its connection may still be opening, but
 * `NIndexedDB` awaits the connection internally on every method, so consumers
 * can use it directly without awaiting first. (Awaiting it is also harmless.)
 */
export type NostrStorageContextType = NIndexedDB;

export const NostrStorageContext = createContext<NostrStorageContextType | null>(null);
