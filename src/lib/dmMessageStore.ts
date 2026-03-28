import type { NostrEvent } from '@nostrify/nostrify';

import { openDatabase, STORE } from '@/lib/db';

// ============================================================================
// DM Message IndexedDB Store
// ============================================================================

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
      await db.put(STORE.MESSAGES, messageStore, userPubkey);
  } catch (error) {
    console.error('[MessageStore] Error writing to IndexedDB:', error);
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
    const data = await db.get(STORE.MESSAGES, userPubkey);
    
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
    await db.delete(STORE.MESSAGES, userPubkey);
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
    await db.clear(STORE.MESSAGES);
  } catch (error) {
    console.error('[MessageStore] Error clearing IndexedDB:', error);
    throw error;
  }
}
