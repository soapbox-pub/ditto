import { createContext, useContext } from "react";
import type { NostrEvent } from "@nostrify/nostrify";
import type { ConnectionState, NestTransport } from "@/nests/transport";

/** The active nest session — survives navigation while minimized. */
export interface NestsSession {
  /** Latest known kind 30312 room event (kept fresh by polling). */
  roomEvent: NostrEvent;
  /** Canonical naddr for the room (used for the /nests/:naddr route). */
  naddr: string;
  /** Room a-tag: "30312:<pubkey>:<d>". */
  roomATag: string;
  /** Effective relay set: user relays ∪ naddr hints ∪ room `relays` tag. */
  relays: string[];
  /** Whether the floating mini-bar is showing instead of the room page. */
  minimized: boolean;
}

export interface NestsContextType {
  /** The active session, or null when not in a nest. */
  session: NestsSession | null;
  /**
   * The audio transport for the active session, or null while it is still
   * being lazily loaded/connected. Components using transport hooks must
   * gate on this.
   */
  transport: NestTransport | null;
  /** MoQ connection state (mirrors transport.state). */
  connectionState: ConnectionState;
  /** Auth error message, if connecting as listener after a failed speaker auth. */
  authError: string | null;
  /** Whether the local user's hand is raised. */
  handRaised: boolean;
  setHandRaised: (v: boolean) => void;
  /** Join a nest (tears down any existing session first). */
  joinNest: (event: NostrEvent, opts?: { relayHints?: string[] }) => void;
  /** Leave the nest: unpublish mic, disconnect, stop presence. */
  leaveNest: () => void;
  /** Show the floating mini-bar (called when navigating away). */
  minimize: () => void;
  /** Hide the mini-bar (called when the room page is showing). */
  expand: () => void;
}

export const NestsContext = createContext<NestsContextType | undefined>(undefined);

export function useNests(): NestsContextType {
  const ctx = useContext(NestsContext);
  if (!ctx) throw new Error("useNests must be used within NestsProvider");
  return ctx;
}
