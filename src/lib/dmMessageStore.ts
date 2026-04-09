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
 * Write messages to IndexedDB for a specific user.
 * Messages are stored in their original encrypted form (kind 4 or kind 13).
 * Silently skipped when IndexedDB is unavailable.
 */
export async function writeMessagesToDB(
  userPubkey: string,
  messageStore: MessageStore
): Promise<void> {
  try {
    const db = await openDatabase();
    if (!db) return; // IndexedDB unavailable — skip persistence.
    // Store messages in their original encrypted form (no NIP-44 wrapper needed)
    // Each message content is already encrypted by the sender
    await db.put(STORE.MESSAGES, messageStore, userPubkey);
  } catch {
    // Write failure is non-critical — DMs still work in-memory.
  }
}

/**
 * Read messages from IndexedDB for a specific user.
 * Messages are stored in their original encrypted form (kind 4 or kind 13).
 * Returns `undefined` when IndexedDB is unavailable.
 */
export async function readMessagesFromDB(
  userPubkey: string
): Promise<MessageStore | undefined> {
  try {
    const db = await openDatabase();
    if (!db) return undefined; // IndexedDB unavailable.
    const data = await db.get(STORE.MESSAGES, userPubkey);
    if (!data) return undefined;
    return data as MessageStore;
  } catch {
    // Read failure — return undefined so the caller proceeds without cache.
    return undefined;
  }
}

/**
 * Delete messages from IndexedDB for a specific user.
 * Silently skipped when IndexedDB is unavailable.
 */
export async function deleteMessagesFromDB(userPubkey: string): Promise<void> {
  try {
    const db = await openDatabase();
    if (!db) return;
    await db.delete(STORE.MESSAGES, userPubkey);
  } catch {
    // Non-critical.
  }
}

/**
 * Clear all messages from IndexedDB.
 * Silently skipped when IndexedDB is unavailable.
 */
export async function clearAllMessages(): Promise<void> {
  try {
    const db = await openDatabase();
    if (!db) return;
    await db.clear(STORE.MESSAGES);
  } catch {
    // Non-critical.
  }
}
