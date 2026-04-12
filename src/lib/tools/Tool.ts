import type { z } from 'zod';
import type { NostrEvent, NostrSigner } from '@nostrify/nostrify';

/** Result returned by a tool's execute method. */
export interface ToolResult {
  /** JSON string returned to the AI as the tool result. */
  result: string;
  /** A Nostr event published by the tool, rendered inline in the chat. */
  nostrEvent?: NostrEvent;
}

/** Tool interface — each tool defines its schema, description, and execution logic. */
export interface Tool<TParams = unknown> {
  /** Human-readable description shown to the AI model. */
  description: string;
  /** Zod schema for validating and parsing tool arguments. */
  inputSchema: z.ZodType<TParams>;
  /** Execute the tool with validated arguments. */
  execute(args: TParams, ctx: ToolContext): Promise<ToolResult>;
}

/**
 * Runtime context injected into every tool execution.
 *
 * Holds the dependencies that come from React hooks (nostr, user, config, etc.)
 * so that Tool classes remain plain objects without hook coupling.
 */
export interface ToolContext {
  /** Nostr protocol client for querying and publishing events. */
  nostr: {
    query: (filters: import('@nostrify/nostrify').NostrFilter[], opts?: { signal?: AbortSignal }) => Promise<NostrEvent[]>;
    event: (event: NostrEvent, opts?: { signal?: AbortSignal }) => Promise<void>;
    group: (relays: string[]) => {
      query: (filters: import('@nostrify/nostrify').NostrFilter[], opts?: { signal?: AbortSignal }) => Promise<NostrEvent[]>;
      event: (event: NostrEvent, opts?: { signal?: AbortSignal }) => Promise<void>;
    };
  };
  /** Currently logged-in user, or undefined if not logged in. */
  user?: {
    pubkey: string;
    signer: NostrSigner;
  };
  /** App configuration values. */
  config: {
    corsProxy: string;
    blossomServerMetadata: { servers: string[]; updatedAt: number };
    useAppBlossomServers: boolean;
  };
  /** Get the buddy secret key (returns null if no buddy is configured). */
  getBuddySecretKey: () => Uint8Array | null;
  /** Saved feed definitions. */
  savedFeeds: Array<{
    id: string;
    label: string;
    spell: NostrEvent;
    createdAt: number;
  }>;
  /** Apply a custom theme to the app. */
  applyCustomTheme: (theme: import('@/themes').ThemeConfig) => void;
  /** Set a screen effect (rain/snow) or null to clear. */
  setScreenEffect: (effect: { type: 'rain' | 'snow'; intensity: 'light' | 'moderate' | 'heavy' } | null) => void;
}
