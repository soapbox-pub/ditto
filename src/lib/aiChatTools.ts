import type { NostrEvent } from '@nostrify/nostrify';

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
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: string;
}

/** Result returned by a tool executor. */
export interface ToolExecutorResult {
  /** JSON string returned to the AI as the tool result. */
  result: string;
  /** A Nostr event published by the tool, to be rendered inline in the chat. */
  nostrEvent?: NostrEvent;
}
