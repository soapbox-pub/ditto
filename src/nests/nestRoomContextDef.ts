import { createContext, useContext } from "react";
import type { NostrEvent } from "@nostrify/nostrify";

export interface RecentReaction {
  id: string;
  pubkey: string;
  emoji: string;
  /** URL for custom emoji images (NIP-30) */
  emojiUrl?: string;
  timestamp: number;
}

/**
 * Route-level UI state for the nest room page. Session-critical state
 * (transport, presence heartbeat, admin commands) lives in NestsProvider
 * instead, so it survives while the nest is minimized.
 */
export interface NestRoomContextType {
  /** The room event */
  event: NostrEvent;
  /** Room a-tag */
  roomATag: string;
  /** Presence list (deduped kind 10312 events) */
  presenceList: NostrEvent[];
  /** Reactions + zap receipts on the room */
  reactions: NostrEvent[];
  /** Recent reactions (within last 5s) for overlay animations */
  recentReactions: RecentReaction[];
  /** Map of pubkey -> most recent reaction (emoji text + optional image URL) */
  participantReactions: Map<string, { emoji: string; emojiUrl?: string }>;
  /** Current user's role in the room */
  isHost: boolean;
  isAdmin: boolean;
  isSpeaker: boolean;
  isHostOrAdmin: boolean;
  /** Optimistically add a local reaction for immediate display */
  addLocalReaction: (emoji: string, emojiUrl?: string) => void;
}

export const NestRoomContext = createContext<NestRoomContextType | null>(null);

export function useNestRoom(): NestRoomContextType {
  const ctx = useContext(NestRoomContext);
  if (!ctx) throw new Error("useNestRoom must be used within NestRoomProvider");
  return ctx;
}
