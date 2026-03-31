import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useShakespeare, type ChatMessage, type Model } from '@/hooks/useShakespeare';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAIChatTools } from '@/hooks/useAIChatTools';
import { TOOLS, type DisplayMessage, type ToolCall } from '@/lib/aiChatTools';
import { SYSTEM_PROMPT } from '@/lib/aiChatSystemPrompt';

import type { NostrEvent } from '@nostrify/nostrify';

// ─── Persistence ───

const CHAT_STORAGE_KEY = 'ditto:ai-chat-messages';

/** Serialized shape stored in localStorage (Date → ISO string). */
interface StoredMessage extends Omit<DisplayMessage, 'timestamp'> {
  timestamp: string;
}

function loadMessages(): DisplayMessage[] {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) return [];
    const stored: StoredMessage[] = JSON.parse(raw);
    return stored.map((m) => ({ ...m, timestamp: new Date(m.timestamp) }));
  } catch {
    return [];
  }
}

function saveMessages(messages: DisplayMessage[]): void {
  try {
    const stored: StoredMessage[] = messages.map((m) => ({ ...m, timestamp: m.timestamp.toISOString() }));
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

// ─── Hook ───

export function useAIChatSession() {
  const { user } = useCurrentUser();
  const { sendChatMessage, getAvailableModels, getCredits, isLoading: apiLoading, error: apiError, clearError } = useShakespeare();
  const { executeToolCall } = useAIChatTools();

  const [messages, setMessages] = useState<DisplayMessage[]>(loadMessages);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [modelsLoading, setModelsLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Persist messages to localStorage
  useEffect(() => {
    saveMessages(messages);
  }, [messages]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Fetch available models on mount
  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    setModelsLoading(true);

    getAvailableModels()
      .then((response) => {
        if (cancelled) return;
        const sorted = response.data.sort((a, b) => {
          const costA = parseFloat(a.pricing.prompt) + parseFloat(a.pricing.completion);
          const costB = parseFloat(b.pricing.prompt) + parseFloat(b.pricing.completion);
          return costA - costB;
        });
        setModels(sorted);
        if (sorted.length > 0 && !selectedModel) {
          setSelectedModel(sorted[0].id);
        }
      })
      .catch((err) => {
        if (!cancelled) console.error('Failed to fetch models:', err);
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false);
      });

    return () => { cancelled = true; };
  }, [user, getAvailableModels]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build the chat messages array for the API
  const buildApiMessages = useCallback((displayMsgs: DisplayMessage[]): ChatMessage[] => {
    const apiMessages: ChatMessage[] = [SYSTEM_PROMPT];

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
  }, []);

  // Handle sending a message
  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || !selectedModel || isStreaming) return;

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

    try {
      const MAX_TOOL_ROUNDS = 10;
      let apiMessages = buildApiMessages(newMessages);
      let currentMessages = newMessages;

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        if (controller.signal.aborted) break;

        const response = await sendChatMessage(apiMessages, selectedModel, {
          tools: TOOLS,
        } as Partial<Record<string, unknown>>, controller.signal);

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

          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.function.arguments);
          } catch {
            // If parsing fails, pass empty args
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
      // Silently handle user-initiated abort
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('Chat error:', err);
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
    }
  }, [input, selectedModel, isStreaming, messages, buildApiMessages, sendChatMessage, executeToolCall, clearError]);

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
    models,
    selectedModel,
    setSelectedModel,
    modelsLoading,
    apiLoading,
    apiError,
    messagesEndRef,

    // Actions
    handleSend,
    handleStop,
    handleKeyDown,
    handleClear,
    getCredits,
  };
}
