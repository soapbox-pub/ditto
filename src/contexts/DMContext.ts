import { createContext } from 'react';
import { type LoadingPhase, type ProtocolMode } from '@/lib/dmConstants';
import { type NostrEvent } from '@nostrify/nostrify';
import type { MessageProtocol } from '@/lib/dmConstants';

// ============================================================================
// DM Types and Constants
// ============================================================================

interface ParticipantData {
  messages: DecryptedMessage[];
  lastActivity: number;
  lastMessage: DecryptedMessage | null;
  hasNIP4: boolean;
  hasNIP17: boolean;
}

type MessagesState = Map<string, ParticipantData>;

interface LastSyncData {
  nip4: number | null;
  nip17: number | null;
}

interface SubscriptionStatus {
  isNIP4Connected: boolean;
  isNIP17Connected: boolean;
}

interface ScanProgress {
  current: number;
  status: string;
}

interface ScanProgressState {
  nip4: ScanProgress | null;
  nip17: ScanProgress | null;
}

interface ConversationSummary {
  id: string;
  pubkey: string;
  lastMessage: DecryptedMessage | null;
  lastActivity: number;
  hasNIP4Messages: boolean;
  hasNIP17Messages: boolean;
  isKnown: boolean;
  isRequest: boolean;
  lastMessageFromUser: boolean;
}

interface DecryptedMessage extends NostrEvent {
  decryptedContent?: string;
  error?: string;
  isSending?: boolean;
  clientFirstSeen?: number;
  decryptedEvent?: NostrEvent; // For NIP-17: the inner kind 14/15 event
  originalGiftWrapId?: string; // Store gift wrap ID for NIP-17 deduplication
}

/**
 * File attachment for direct messages (NIP-92 compatible).
 * 
 * All fields are required. Use with `useUploadFile` hook to upload files
 * and generate the proper tags format.
 * 
 * @example
 * ```tsx
 * import { useUploadFile } from '@/hooks/useUploadFile';
 * import type { FileAttachment } from '@/contexts/DMContext';
 * 
 * const { mutateAsync: uploadFile } = useUploadFile();
 * 
 * const tags = await uploadFile(file);
 * const attachment: FileAttachment = {
 *   url: tags[0][1],
 *   mimeType: file.type,
 *   size: file.size,
 *   name: file.name,
 *   tags: tags
 * };
 * 
 * await sendMessage({
 *   recipientPubkey: 'hex-pubkey',
 *   content: 'Check out this file!',
 *   attachments: [attachment]
 * });
 * ```
 * 
 * @property url - Blossom server URL where file is hosted
 * @property mimeType - MIME type of the file (e.g., 'image/png')
 * @property size - File size in bytes
 * @property name - Original filename
 * @property tags - NIP-94 file metadata tags (includes hashes)
 */
export interface FileAttachment {
  url: string;
  mimeType: string;
  size: number;
  name: string;
  tags: string[][];
}

/**
 * Direct Messaging context interface providing access to all DM functionality.
 * 
 * @property messages - Raw message state (Map of pubkey -> participant data)
 * @property isLoading - True during initial load phases
 * @property loadingPhase - Current loading phase (CACHE, RELAYS, SUBSCRIPTIONS, READY, IDLE)
 * @property isDoingInitialLoad - True only during cache/relay loading (not subscriptions)
 * @property lastSync - Unix timestamps of last successful sync for each protocol
 * @property subscriptions - Connection status for real-time message subscriptions
 * @property conversations - Array of conversation summaries sorted by last activity
 * @property sendMessage - Send an encrypted direct message (NIP-04 or NIP-17)
 * @property protocolMode - Current protocol mode (NIP04_ONLY, NIP17_ONLY, or BOTH)
 * @property scanProgress - Progress info for large message history scans
 * @property clearCacheAndRefetch - Clear IndexedDB cache and reload all messages from relays
 */
export interface DMContextType {
  messages: MessagesState;
  isLoading: boolean;
  loadingPhase: LoadingPhase;
  isDoingInitialLoad: boolean;
  lastSync: LastSyncData;
  subscriptions: SubscriptionStatus;
  conversations: ConversationSummary[];
  sendMessage: (params: { 
    recipientPubkey: string; 
    content: string; 
    protocol?: MessageProtocol;
    attachments?: FileAttachment[];
  }) => Promise<void>;
  protocolMode: ProtocolMode;
  scanProgress: ScanProgressState;
  clearCacheAndRefetch: () => Promise<void>;
}

export const DMContext = createContext<DMContextType | null>(null);