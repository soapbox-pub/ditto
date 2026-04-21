import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from './useCurrentUser';
import type { NUser } from '@nostrify/react/login';

/** Error subclass carrying rate-limit metadata. */
export class RateLimitError extends Error {
  /** Unix-ms timestamp after which the client may retry. */
  retryAfter: number;
  constructor(retryAfter: number) {
    const seconds = Math.max(0, Math.ceil((retryAfter - Date.now()) / 1000));
    super(`Rate limited. Please wait ${seconds} second${seconds !== 1 ? 's' : ''} before trying again.`);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

// Types for Shakespeare API (compatible with OpenAI ChatCompletionMessageParam)
export interface ToolCallFunction {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | null | Array<{
    type: 'text' | 'image_url';
    text?: string;
    image_url?: {
      url: string;
    };
  }>;
  /** Present on assistant messages that invoke tools. */
  tool_calls?: ToolCallFunction[];
  /** Present on tool result messages — must match a tool_calls[].id from the preceding assistant message. */
  tool_call_id?: string;
}

/** Tool function definition for chat completions. */
export interface ChatCompletionTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/** A tool call returned by the model. */
export interface ChatCompletionToolCall {
  id: string;
  function: { name: string; arguments: string };
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  tools?: ChatCompletionTool[];
}

/** A message in a chat completion response, possibly including tool calls. */
export interface ChatCompletionResponseMessage {
  role: 'assistant';
  content?: string;
  tool_calls?: ChatCompletionToolCall[];
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: ChatCompletionResponseMessage;
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface Model {
  id: string;
  name: string;
  description: string;
  object: string;
  owned_by: string;
  created: number;
  context_window: number;
  pricing: {
    prompt: string;
    completion: string;
  };
  /** Provider prefix for routing (e.g. "shakespeare"). */
  provider: string;
  /** Full provider/model identifier for selection (e.g. "shakespeare/model-name"). */
  fullId: string;
}

export interface ModelsResponse {
  object: string;
  data: Model[];
}

export interface CreditsResponse {
  object: string;
  amount: number;
}

// ─── Provider Configuration ───

const SHAKESPEARE_API_URL = 'https://ai.shakespeare.diy/v1';

// ─── Helpers ───

/** Create a NIP-98 auth token for Shakespeare AI requests. */
async function createNIP98Token(
  method: string,
  url: string,
  body?: unknown,
  user?: NUser
): Promise<string> {
  if (!user?.signer) {
    throw new Error('User signer is required for NIP-98 authentication');
  }

  const tags: string[][] = [
    ['u', url],
    ['method', method]
  ];

  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    const bodyString = JSON.stringify(body);
    const encoder = new TextEncoder();
    const data = encoder.encode(bodyString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const payloadHash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    tags.push(['payload', payloadHash]);
  }

  const event = await user.signer.signEvent({
    kind: 27235,
    content: '',
    tags,
    created_at: Math.floor(Date.now() / 1000)
  });

  return btoa(JSON.stringify(event));
}

/** Parse the Retry-After header into a future Unix-ms timestamp. */
function parseRetryAfter(response: Response): number {
  const header = response.headers.get('Retry-After');
  if (header) {
    const seconds = Number(header);
    if (!Number.isNaN(seconds) && seconds > 0) {
      return Date.now() + seconds * 1000;
    }
    // Try HTTP-date format
    const date = new Date(header).getTime();
    if (!Number.isNaN(date) && date > Date.now()) {
      return date;
    }
  }
  // Default: 30-second cooldown when no header is present
  return Date.now() + 30_000;
}

/** Handle API errors with user-friendly messages. */
async function handleAPIError(response: Response) {
  if (response.status === 429) {
    // Shakespeare returns 429 with code "insufficient_quota" when credits run out
    try {
      const body = await response.json();
      if (body.error?.code === 'insufficient_quota' || body.code === 'insufficient_quota') {
        throw new Error('You\'ve run out of credits. Add more on shakespeare.diy to keep chatting.');
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('run out of credits')) throw err;
      // JSON parse failed or different shape — treat as a normal rate limit
    }
    throw new RateLimitError(parseRetryAfter(response));
  } else if (response.status === 401) {
    throw new Error('Authentication failed. Please make sure you are logged in with a Nostr account.');
  } else if (response.status === 402) {
    throw new Error('You\'ve run out of credits. Add more on shakespeare.diy to keep chatting.');
  } else if (response.status === 400) {
    let parsed: Record<string, unknown> | undefined;
    try {
      parsed = await response.json();
    } catch {
      // JSON parse failed — fall through to generic message
    }
    if (parsed) {
      const err = parsed.error as Record<string, unknown> | undefined;
      if (err?.type === 'invalid_request_error') {
        if (err.code === 'minimum_amount_not_met') {
          throw new Error(`Minimum credit amount is $${err.minimum_amount}. Please increase your payment amount.`);
        } else if (err.code === 'unsupported_method') {
          throw new Error('Payment method not supported. Please use "stripe" or "lightning".');
        } else if (err.code === 'invalid_url') {
          throw new Error('Invalid redirect URL provided for Stripe payment.');
        }
      }
      throw new Error(`Invalid request: ${err?.message || (parsed as Record<string, unknown>).details || err || 'Please check your request parameters.'}`);
    }
    throw new Error('Invalid request. Please check your parameters and try again.');
  } else if (response.status === 404) {
    throw new Error('Resource not found. Please check the payment ID or try again.');
  } else if (response.status >= 500) {
    throw new Error('Server error. Please try again in a few moments.');
  } else if (!response.ok) {
    try {
      const errorData = await response.json();
      throw new Error(`API error: ${errorData.error?.message || errorData.details || errorData.error || response.statusText}`);
    } catch {
      throw new Error(`Network error: ${response.statusText}. Please check your connection and try again.`);
    }
  }
}

/** Parse "provider/model" into { provider, model }. */
function parseProviderModel(fullId: string): { provider: string; model: string } {
  const idx = fullId.indexOf('/');
  if (idx === -1) return { provider: 'shakespeare', model: fullId };
  return { provider: fullId.substring(0, idx), model: fullId.substring(idx + 1) };
}

/** Format an error for display. */
function formatError(err: unknown): string {
  let msg = 'An unexpected error occurred';
  if (err instanceof Error) msg = err.message;
  else if (typeof err === 'string') msg = err;

  if (msg.includes('Failed to fetch') || msg.includes('Network')) {
    return 'Network error: Please check your internet connection and try again.';
  } else if (msg.includes('signer')) {
    return 'Authentication error: Please make sure you are logged in with a Nostr account that supports signing.';
  }
  return msg;
}

// ─── Hook ───

export function useShakespeare() {
  const { user } = useCurrentUser();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Unix-ms timestamp until which the client is rate-limited, or null. */
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Auto-clear retryAfter once the cooldown expires.
  useEffect(() => {
    if (retryAfter === null) return;
    clearTimeout(retryTimerRef.current);
    const remaining = retryAfter - Date.now();
    if (remaining <= 0) {
      setRetryAfter(null);
      setError(null);
      return;
    }
    retryTimerRef.current = setTimeout(() => {
      setRetryAfter(null);
      setError(null);
    }, remaining);
    return () => clearTimeout(retryTimerRef.current);
  }, [retryAfter]);

  const clearError = useCallback(() => {
    setError(null);
    setRetryAfter(null);
  }, []);

  // ─── Chat completions (non-streaming) ───

  const sendChatMessage = useCallback(async (
    messages: ChatMessage[],
    modelId: string,
    options?: Partial<ChatCompletionRequest>
  ): Promise<ChatCompletionResponse> => {
    if (!user) {
      throw new Error('User must be logged in to use AI features');
    }

    setIsLoading(true);
    setError(null);

    try {
      const { model } = parseProviderModel(modelId);

      const requestBody: ChatCompletionRequest = {
        model,
        messages,
        ...options,
      };

      const token = await createNIP98Token(
        'POST',
        `${SHAKESPEARE_API_URL}/chat/completions`,
        requestBody,
        user,
      );
      const response = await fetch(`${SHAKESPEARE_API_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Nostr ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      await handleAPIError(response);
      return await response.json();
    } catch (err) {
      if (err instanceof RateLimitError) {
        setRetryAfter(err.retryAfter);
        setError(err.message);
        throw err;
      }
      const msg = formatError(err);
      setError(msg);
      throw new Error(msg);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // ─── Chat completions (streaming) ───
  //
  // Streams text via `onChunk` and returns the fully-assembled response
  // (including any tool_calls) so callers can use the same tool-loop
  // logic as the non-streaming path.

  const sendStreamingMessage = useCallback(async (
    messages: ChatMessage[],
    modelId: string,
    onChunk: (chunk: string) => void,
    options?: Partial<ChatCompletionRequest>,
    signal?: AbortSignal,
  ): Promise<ChatCompletionResponse> => {
    if (!user) {
      throw new Error('User must be logged in to use AI features');
    }

    setIsLoading(true);
    setError(null);

    try {
      const { model } = parseProviderModel(modelId);

      const requestBody: ChatCompletionRequest = {
        model,
        messages,
        stream: true,
        ...options,
      };

      const token = await createNIP98Token(
        'POST',
        `${SHAKESPEARE_API_URL}/chat/completions`,
        requestBody,
        user,
      );
      const response = await fetch(`${SHAKESPEARE_API_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Nostr ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal,
      });

      await handleAPIError(response);

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      // Accumulate the full response from stream deltas
      let content = '';
      let finishReason = 'stop';
      let responseId = '';
      let responseModel = model;
      const toolCalls: Map<number, ToolCallFunction> = new Map();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6);
            if (data === '[DONE]') break;

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta;
              if (!delta) continue;

              if (parsed.id) responseId = parsed.id;
              if (parsed.model) responseModel = parsed.model;
              if (parsed.choices?.[0]?.finish_reason) {
                finishReason = parsed.choices[0].finish_reason;
              }

              // Accumulate text content and stream to UI
              if (delta.content) {
                content += delta.content;
                onChunk(delta.content);
              }

              // Accumulate tool call deltas
              if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const idx = tc.index ?? 0;
                  const existing = toolCalls.get(idx);
                  if (!existing) {
                    toolCalls.set(idx, {
                      id: tc.id ?? '',
                      type: 'function',
                      function: {
                        name: tc.function?.name ?? '',
                        arguments: tc.function?.arguments ?? '',
                      },
                    });
                  } else {
                    if (tc.id) existing.id = tc.id;
                    if (tc.function?.name) existing.function.name += tc.function.name;
                    if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
                  }
                }
              }
            } catch {
              // Ignore parsing errors for incomplete chunks
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      // Assemble the full response in the same shape as the non-streaming endpoint
      const assembledToolCalls = toolCalls.size > 0
        ? Array.from(toolCalls.values())
        : undefined;

      return {
        id: responseId,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: responseModel,
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: content || undefined,
            ...(assembledToolCalls ? { tool_calls: assembledToolCalls } : {}),
          },
          finish_reason: finishReason,
        }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      };
    } catch (err) {
      if (err instanceof RateLimitError) {
        setRetryAfter(err.retryAfter);
        setError(err.message);
        throw err;
      }
      const msg = formatError(err);
      setError(msg);
      throw new Error(msg);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // ─── Credit balance (Shakespeare AI only) ───

  const getCreditsBalance = useCallback(async (): Promise<CreditsResponse> => {
    if (!user) {
      throw new Error('User must be logged in to check credits');
    }

    try {
      const token = await createNIP98Token(
        'GET',
        `${SHAKESPEARE_API_URL}/credits`,
        undefined,
        user,
      );

      const response = await fetch(`${SHAKESPEARE_API_URL}/credits`, {
        method: 'GET',
        headers: { 'Authorization': `Nostr ${token}` },
      });

      await handleAPIError(response);
      return await response.json();
    } catch (err) {
      throw new Error(formatError(err));
    }
  }, [user]);

  // ─── Available models (merged from both providers) ───

  const getAvailableModels = useCallback(async (): Promise<ModelsResponse> => {
    if (!user) {
      throw new Error('User must be logged in to use AI features');
    }

    setIsLoading(true);
    setError(null);

    try {
      const token = await createNIP98Token(
        'GET',
        `${SHAKESPEARE_API_URL}/models`,
        undefined,
        user,
      );
      const response = await fetch(`${SHAKESPEARE_API_URL}/models`, {
        method: 'GET',
        headers: { 'Authorization': `Nostr ${token}` },
      });
      await handleAPIError(response);
      const result = (await response.json()) as ModelsResponse;

      const models: Model[] = result.data.map((m) => ({
        ...m,
        provider: 'shakespeare',
        fullId: `shakespeare/${m.id}`,
      }));

      return { object: 'list', data: models };
    } catch (err) {
      const msg = formatError(err);
      setError(msg);
      throw new Error(msg);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  return {
    // State
    isLoading,
    error,
    /** Unix-ms timestamp until which the client is rate-limited, or null. */
    retryAfter,
    isAuthenticated: !!user,

    // Actions
    sendChatMessage,
    sendStreamingMessage,
    getAvailableModels,
    getCreditsBalance,
    clearError,
  };
}

// ─── Shared Credits Hook ───

/**
 * Shared hook for checking Shakespeare credits balance.
 *
 * Returns `true` when the user has credits, `false` when they don't, and
 * `null` while loading or when the request fails (so the UI doesn't lock the
 * user out on transient errors).
 */
export function useShakespeareCredits(): boolean | null {
  const { user } = useCurrentUser();
  const { getCreditsBalance } = useShakespeare();

  const { data } = useQuery({
    queryKey: ['shakespeare-credits-check', user?.pubkey],
    queryFn: async (): Promise<boolean | null> => {
      try {
        const response = await getCreditsBalance();
        return response.amount > 0;
      } catch {
        // On failure return null so the UI stays in "unknown" state
        // rather than locking the user out.
        return null;
      }
    },
    staleTime: 5 * 60_000,
    enabled: !!user,
  });

  return data ?? null;
}
