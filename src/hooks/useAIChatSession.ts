import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { nip19 } from 'nostr-tools';
import { z } from 'zod';
import { useShakespeare, sortModelsByCost, type ChatMessage, type Model } from '@/hooks/useShakespeare';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { useAIChatTools, TOOLS } from '@/hooks/useAIChatTools';
import { type DisplayMessage, type ToolCall } from '@/lib/aiChatTools';
import { buildSystemPrompt, type UserIdentity } from '@/lib/aiChatSystemPrompt';

import type { NostrEvent } from '@nostrify/nostrify';

/** Conservative localStorage budget for chat messages (4 MB). */
const MAX_STORAGE_BYTES = 4 * 1024 * 1024;

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

/** Persist messages and return the serialized byte size. */
function saveMessages(messages: DisplayMessage[]): number {
  try {
    const stored = messages.map((m) => ({ ...m, timestamp: m.timestamp.toISOString() }));
    const json = JSON.stringify(stored);
    localStorage.setItem(CHAT_STORAGE_KEY, json);
    return new Blob([json]).size;
  } catch {
    // Storage full or unavailable — silently ignore
    return 0;
  }
}

/** Measure byte size of the current persisted messages without re-serializing. */
function measureStorageBytes(): number {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    return raw ? new Blob([raw]).size : 0;
  } catch {
    return 0;
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
  const [models, setModels] = useState<Model[]>([]);
  const selectedModel = config.aiModel || defaultModel;

  // Capacity tracking
  const [lastPromptTokens, setLastPromptTokens] = useState(0);
  const [storageBytes, setStorageBytes] = useState(measureStorageBytes);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Persist messages to localStorage and update storage bytes
  useEffect(() => {
    const bytes = saveMessages(messages);
    setStorageBytes(bytes);
  }, [messages]);

  // Scroll to bottom on new messages or streaming text updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  // Fetch available models (for default model + context_window lookup)
  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    getAvailableModels()
      .then((response) => {
        if (cancelled) return;
        setModels(response.data);
        if (!config.aiModel) {
          const sorted = sortModelsByCost(response.data);
          if (sorted.length > 0) {
            setDefaultModel(sorted[0].id);
          }
        }
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [user, config.aiModel, getAvailableModels]);

  // Compute capacity ratio (0 to 1) — max of token usage and storage usage
  const contextWindow = useMemo(() => {
    if (!selectedModel || models.length === 0) return 0;
    // selectedModel may be "model-id" or "shakespeare/model-id"
    const model = models.find((m) => m.id === selectedModel || m.fullId === selectedModel);
    return model?.context_window ?? 0;
  }, [selectedModel, models]);

  const capacity = useMemo(() => {
    const tokenRatio = contextWindow > 0 && lastPromptTokens > 0
      ? lastPromptTokens / contextWindow
      : 0;
    const storageRatio = storageBytes / MAX_STORAGE_BYTES;
    return Math.min(Math.max(tokenRatio, storageRatio), 1);
  }, [lastPromptTokens, contextWindow, storageBytes]);

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

  // Clear conversation
  const handleClear = useCallback(() => {
    setMessages([]);
    localStorage.removeItem(CHAT_STORAGE_KEY);
    setLastPromptTokens(0);
    setStorageBytes(0);
    clearError();
  }, [clearError]);

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
      // Unknown command — show feedback in chat
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        content: `Unknown command \`${trimmed.split(' ')[0]}\`. Available commands: \`/new\`, \`/clear\`.`,
        timestamp: new Date(),
      }]);
      setInput('');
      return;
    }

    if (!selectedModel) return;

    // Block sends when conversation capacity is exhausted
    if (capacity >= 1) {
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        content: 'This conversation has reached its limit. Use /clear to start a fresh conversation.',
        timestamp: new Date(),
      }]);
      setInput('');
      return;
    }

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

    let streamAccumulator = '';

    try {
      const MAX_TOOL_ROUNDS = 10;
      let apiMessages = buildApiMessages(newMessages);
      let currentMessages = newMessages;

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        if (controller.signal.aborted) break;

        // Stream the response — text chunks update streamingText in real-time
        streamAccumulator = '';
        const response = await sendStreamingMessage(
          apiMessages,
          selectedModel,
          (chunk) => {
            streamAccumulator += chunk;
            setStreamingText(streamAccumulator);
          },
          { tools: TOOLS },
          controller.signal,
        );

        // Stream finished — clear the streaming text and update token usage
        setStreamingText('');
        if (response.usage.prompt_tokens > 0) {
          setLastPromptTokens(response.usage.prompt_tokens);
        }

        const choice = response.choices[0];
        const assistantMsg = choice.message;

        if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
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

        for (const tc of assistantMsg.tool_calls) {
          if (controller.signal.aborted) break;

          let args: Record<string, unknown>;
          try {
            args = JSON.parse(tc.function.arguments);
          } catch (parseErr) {
            // Log the raw arguments for debugging — helps distinguish between
            // empty strings (model didn't emit args) vs truncated JSON (buffering issue)
            console.error(
              `[AI tool call] Failed to parse arguments for "${tc.function.name}":`,
              parseErr instanceof Error ? parseErr.message : parseErr,
              '\nRaw arguments string:',
              JSON.stringify(tc.function.arguments),
            );
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
          content: assistantMsg.content || '',
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
      // User-initiated stop — preserve whatever was streamed so far
      if (controller.signal.aborted) {
        if (streamAccumulator.trim()) {
          setMessages((prev) => [...prev, {
            id: crypto.randomUUID(),
            role: 'assistant' as const,
            content: streamAccumulator,
            timestamp: new Date(),
          }]);
        }
        return;
      }

      // Surface unexpected errors (e.g. buildApiMessages failure, loop bookkeeping)
      // so the user gets feedback instead of streaming silently stopping.
      // API-level errors are already surfaced via apiError from useShakespeare.
      const errorText = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        content: `Something went wrong: ${errorText}`,
        timestamp: new Date(),
      }]);
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
      setStreamingText('');
    }
  }, [input, selectedModel, isStreaming, messages, capacity, buildApiMessages, sendStreamingMessage, executeToolCall, clearError, handleClear]);

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

    // Capacity
    capacity,
    lastPromptTokens,
    contextWindow,
    storageBytes,
    maxStorageBytes: MAX_STORAGE_BYTES,

    // Actions
    handleSend,
    handleStop,
    handleKeyDown,
    handleClear,
    getCredits: getCreditsBalance,
  };
}
