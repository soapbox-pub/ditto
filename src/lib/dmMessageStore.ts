import { openDB, type IDBPDatabase } from 'idb';
import type { NostrEvent } from '@nostrify/nostrify';

// ============================================================================
// IndexedDB Schema
// ============================================================================

// Use domain-based naming to avoid conflicts between apps on same domain
const getDBName = () => {
  // Use hostname for unique DB per app (e.g., 'nostr-dm-store-localhost', 'nostr-dm-store-myapp.com')
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'default';
  return `nostr-dm-store-${hostname}`;
};
const DB_NAME = getDBName();
const DB_VERSION = 1;
const STORE_NAME = 'messages';

interface StoredParticipant {
  messages: NostrEvent[];
  lastActivity: number;
  hasNIP4: boolean;
  hasNIP17: boolean;
}

export interface MessageStore {
  participants: Record<string, StoredParticipant>;
  lastSync: {
    nip4: number | null;
    nip17: number | null;
  };
}

// ============================================================================
// Database Operations
// ============================================================================

/**
 * Open the IndexedDB database
 */
async function openDatabase(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Create the messages store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    },
  });
}

/**
 * Write messages to IndexedDB for a specific user
 * Messages are stored in their original encrypted form (kind 4 or kind 13)
 */
export async function writeMessagesToDB(
  userPubkey: string,
  messageStore: MessageStore
): Promise<void> {
  try {
    const db = await openDatabase();
    
      // Store messages in their original encrypted form (no NIP-44 wrapper needed)
      // Each message content is already encrypted by the sender
      await db.put(STORE_NAME, messageStore, userPubkey);
  } catch (error) {
    console.error('[MessageStore] ❌ Error writing to IndexedDB:', error);
    throw error;
  }
}

/**
 * Read messages from IndexedDB for a specific user
 * Messages are stored in their original encrypted form (kind 4 or kind 13)
 */
export async function readMessagesFromDB(
  userPubkey: string
): Promise<MessageStore | undefined> {
  try {
    const db = await openDatabase();
    const data = await db.get(STORE_NAME, userPubkey);
    
    if (!data) {
      return undefined;
    }
    
    return data as MessageStore;
  } catch (error) {
    console.error('[MessageStore] Error reading from IndexedDB:', error);
    throw error;
  }
}

/**
 * Delete messages from IndexedDB for a specific user
 */
export async function deleteMessagesFromDB(userPubkey: string): Promise<void> {
  try {
    const db = await openDatabase();
    await db.delete(STORE_NAME, userPubkey);
  } catch (error) {
    console.error('[MessageStore] Error deleting from IndexedDB:', error);
    throw error;
  }
}

/**
 * Clear all messages from IndexedDB
 */
export async function clearAllMessages(): Promise<void> {
  try {
    const db = await openDatabase();
    await db.clear(STORE_NAME);
  } catch (error) {
    console.error('[MessageStore] Error clearing IndexedDB:', error);
    throw error;
  }
}
