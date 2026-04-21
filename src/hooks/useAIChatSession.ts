import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { nip19 } from 'nostr-tools';
import { z } from 'zod';
import { useShakespeare, type ChatMessage } from '@/hooks/useShakespeare';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { useAIChatTools, TOOLS } from '@/hooks/useAIChatTools';
import { type DisplayMessage, type ToolCall } from '@/lib/aiChatTools';
import { buildSystemPrompt, type UserIdentity } from '@/lib/aiChatSystemPrompt';

import type { NostrEvent } from '@nostrify/nostrify';

/** Options for configuring the AI chat session with a buddy identity. */
export interface AIChatSessionOptions {
  /** Buddy agent display name. When omitted, defaults to "Dork". */
  buddyName?: string;
  /** Buddy soul text injected into the system prompt. */
  buddySoul?: string;
}

// ─── Persistence ───

const CHAT_STORAGE_KEY = 'ditto:ai-chat-messages';

/** Zod schema for a single persisted chat message. */
const StoredToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()),
  result: z.string().optional(),
});

const StoredMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant', 'system', 'tool_result']),
  content: z.string(),
  timestamp: z.string(),
  toolCalls: z.array(StoredToolCallSchema).optional(),
  toolCallId: z.string().optional(),
  // nostrEvent is not validated in detail — just needs to be an object if present
  nostrEvent: z.record(z.string(), z.unknown()).optional(),
});

const StoredMessagesSchema = z.array(StoredMessageSchema);

function loadMessages(): DisplayMessage[] {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = StoredMessagesSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      console.warn('Discarding corrupted AI chat history:', parsed.error.message);
      localStorage.removeItem(CHAT_STORAGE_KEY);
      return [];
    }
    return parsed.data.map((m) => ({
      ...m,
      timestamp: new Date(m.timestamp),
      nostrEvent: m.nostrEvent as NostrEvent | undefined,
      toolCalls: m.toolCalls as ToolCall[] | undefined,
    }));
  } catch {
    return [];
  }
}

function saveMessages(messages: DisplayMessage[]): void {
  try {
    const stored = messages.map((m) => ({ ...m, timestamp: m.timestamp.toISOString() }));
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

// ─── Hook ───

export function useAIChatSession(options: AIChatSessionOptions = {}) {
  const { buddyName, buddySoul } = options;
  const { user, metadata } = useCurrentUser();
  const { config } = useAppContext();
  const { sendStreamingMessage, getAvailableModels, getCreditsBalance, isLoading: apiLoading, error: apiError, clearError } = useShakespeare();
  const { executeToolCall, savedFeeds } = useAIChatTools();

  const [messages, setMessages] = useState<DisplayMessage[]>(loadMessages);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');

  // Resolve the effective model: config value, or fetch the cheapest as default
  const [defaultModel, setDefaultModel] = useState('');
  const selectedModel = config.aiModel || defaultModel;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Persist messages to localStorage
  useEffect(() => {
    saveMessages(messages);
  }, [messages]);

  // Scroll to bottom on new messages or streaming text updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  // Fetch cheapest model as fallback when no model is configured
  useEffect(() => {
    if (!user || config.aiModel) return;

    let cancelled = false;
    getAvailableModels()
      .then((response) => {
        if (cancelled) return;
        const sorted = response.data.sort((a, b) => {
          const costA = parseFloat(a.pricing.prompt) + parseFloat(a.pricing.completion);
          const costB = parseFloat(b.pricing.prompt) + parseFloat(b.pricing.completion);
          return costA - costB;
        });
        if (sorted.length > 0) {
          setDefaultModel(sorted[0].id);
        }
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [user, config.aiModel, getAvailableModels]);

  // Build the system prompt — dynamic based on buddy identity, saved feeds, user identity, + optional custom override
  const savedFeedLabels = useMemo(() => savedFeeds.map((f) => f.label), [savedFeeds]);

  const userIdentity = useMemo<UserIdentity | undefined>(() => {
    if (!user) return undefined;
    return {
      npub: nip19.npubEncode(user.pubkey),
      pubkey: user.pubkey,
      displayName: metadata?.display_name || metadata?.name,
      nip05: metadata?.nip05,
      about: metadata?.about,
    };
  }, [user, metadata]);

  const systemPrompt = useMemo(
    () => buildSystemPrompt(buddyName, buddySoul, config.aiSystemPrompt || undefined, savedFeedLabels, userIdentity),
    [buddyName, buddySoul, config.aiSystemPrompt, savedFeedLabels, userIdentity],
  );

  // Build the chat messages array for the API
  const buildApiMessages = useCallback((displayMsgs: DisplayMessage[]): ChatMessage[] => {
    const apiMessages: ChatMessage[] = [systemPrompt];

    for (const msg of displayMsgs) {
      if (msg.role === 'tool_result') {
        apiMessages.push({
          role: 'tool',
          content: msg.content,
          tool_call_id: msg.toolCallId,
        });
      } else if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        apiMessages.push({
          role: 'assistant',
          content: msg.content || null,
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
          })),
        });
      } else {
        apiMessages.push({ role: msg.role as 'user' | 'assistant' | 'system', content: msg.content });
      }
    }

    return apiMessages;
  }, [systemPrompt]);

  // Handle sending a message. Pass `override` to send arbitrary text (e.g. suggestion chips).
  const handleSend = useCallback(async (override?: string) => {
    const trimmed = (override ?? input).trim();
    if (!trimmed || isStreaming) return;

    // Slash commands — handled locally, never sent to the API
    if (trimmed.startsWith('/')) {
      const cmd = trimmed.toLowerCase();
      if (cmd === '/new' || cmd === '/clear') {
        handleClear();
        setInput('');
        return;
      }
      // Unknown command — ignore silently
      setInput('');
      return;
    }

    if (!selectedModel) return;

    clearError();
    setInput('');

    const controller = new AbortController();
    abortRef.current = controller;

    const userMessage: DisplayMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setIsStreaming(true);
    setStreamingText('');

    try {
      const MAX_TOOL_ROUNDS = 10;
      let apiMessages = buildApiMessages(newMessages);
      let currentMessages = newMessages;

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        if (controller.signal.aborted) break;

        // Stream the response — text chunks update streamingText in real-time
        let streamAccumulator = '';
        const response = await sendStreamingMessage(
          apiMessages,
          selectedModel,
          (chunk) => {
            streamAccumulator += chunk;
            setStreamingText(streamAccumulator);
          },
          { tools: TOOLS } as Partial<Record<string, unknown>>,
          controller.signal,
        );

        // Stream finished — clear the streaming text
        setStreamingText('');

        const choice = response.choices[0];
        const assistantMsg = choice.message;

        // Check for tool calls
        const rawMessage = assistantMsg as unknown as {
          content?: string;
          tool_calls?: Array<{
            id: string;
            function: { name: string; arguments: string };
          }>;
        };

        if (!rawMessage.tool_calls || rawMessage.tool_calls.length === 0) {
          const content = typeof assistantMsg.content === 'string' ? assistantMsg.content : '';
          const assistantMessage: DisplayMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, assistantMessage]);
          break;
        }

        // Execute tool calls
        let nostrEvent: NostrEvent | undefined;
        const toolCalls: ToolCall[] = [];

        for (const tc of rawMessage.tool_calls) {
          if (controller.signal.aborted) break;

          let args: Record<string, unknown>;
          try {
            args = JSON.parse(tc.function.arguments);
          } catch {
            // Return an error to the AI so it can retry instead of silently running with empty args
            toolCalls.push({
              id: tc.id,
              name: tc.function.name,
              arguments: {},
              result: JSON.stringify({ error: `Invalid tool call arguments: could not parse JSON for ${tc.function.name}` }),
            });
            continue;
          }

          const execResult = await executeToolCall(tc.function.name, args);

          if (execResult.nostrEvent) {
            nostrEvent = execResult.nostrEvent;
          }

          toolCalls.push({
            id: tc.id,
            name: tc.function.name,
            arguments: args,
            result: execResult.result,
          });
        }

        if (controller.signal.aborted) break;

        // Add assistant message with tool calls to display
        const toolMsg: DisplayMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: rawMessage.content || '',
          timestamp: new Date(),
          toolCalls,
          nostrEvent,
        };

        // Add tool result display messages (hidden in UI, used by buildApiMessages)
        const toolResultMsgs: DisplayMessage[] = toolCalls.map((tc) => ({
          id: crypto.randomUUID(),
          role: 'tool_result' as const,
          content: tc.result ?? '',
          toolCallId: tc.id,
          timestamp: new Date(),
        }));

        currentMessages = [...currentMessages, toolMsg, ...toolResultMsgs];
        setMessages(currentMessages);

        // Rebuild API messages
        apiMessages = buildApiMessages(currentMessages);
      }
    } catch (err) {
      // Silently handle user-initiated abort and other errors
      // (API-level errors are surfaced via apiError from useShakespeare)
      if (err instanceof DOMException && err.name === 'AbortError') return;
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
      setStreamingText('');
    }
  }, [input, selectedModel, isStreaming, messages, buildApiMessages, sendStreamingMessage, executeToolCall, clearError]);

  // Stop an in-flight generation
  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // Clear conversation
  const handleClear = useCallback(() => {
    setMessages([]);
    localStorage.removeItem(CHAT_STORAGE_KEY);
    clearError();
  }, [clearError]);

  return {
    // State
    messages,
    input,
    setInput,
    isStreaming,
    streamingText,
    selectedModel,
    apiLoading,
    apiError,
    messagesEndRef,

    // Actions
    handleSend,
    handleStop,
    handleKeyDown,
    handleClear,
    getCredits: getCreditsBalance,
  };
}
