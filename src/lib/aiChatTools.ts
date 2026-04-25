import type { NostrEvent } from '@nostrify/nostrify';
import type { ToolResult } from '@/lib/tools/Tool';

// Re-export ToolResult so existing consumers can import from here.
export type { ToolResult };

// ─── Message Types ───

export interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool_result';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
  /** For tool_result messages: the tool_call_id this result corresponds to. */
  toolCallId?: string;
  /** A Nostr event published by a tool, rendered inline in the chat. */
  nostrEvent?: NostrEvent;
  /** When set, the message is a client-generated notice rather than model output. Determines visual styling:
   *  - `'info'`: muted informational notice (e.g. /tools listing, unknown command)
   *  - `'error'`: destructive-styled warning (e.g. capacity exhausted, unexpected error) */
  noticeVariant?: 'info' | 'error';
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: string;
}
