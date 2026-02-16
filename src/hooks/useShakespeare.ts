import { useCallback, useState } from 'react';
import { useCurrentUser } from './useCurrentUser';
import type { NUser } from '@nostrify/react/login';

// Types for Shakespeare API (compatible with OpenAI ChatCompletionMessageParam)
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | Array<{
    type: 'text' | 'image_url';
    text?: string;
    image_url?: {
      url: string;
    };
  }>;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
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
}

export interface ModelsResponse {
  object: string;
  data: Model[];
}

// Configuration
const SHAKESPEARE_API_URL = 'https://ai.shakespeare.diy/v1';

// Helper function to create NIP-98 token
async function createNIP98Token(
  method: string,
  url: string,
  body?: unknown,
  user?: NUser
): Promise<string> {
  if (!user?.signer) {
    throw new Error('User signer is required for NIP-98 authentication');
  }

  // Create the tags array
  const tags: string[][] = [
    ['u', url],
    ['method', method]
  ];

  // Add payload hash for requests with body (following NIP-98 spec)
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

  // Create the HTTP request event
  const event = await user.signer.signEvent({
    kind: 27235, // NIP-98 HTTP Auth
    content: '',
    tags,
    created_at: Math.floor(Date.now() / 1000)
  });
  
  // Return the token (base64 encoded event)
  return btoa(JSON.stringify(event));
}

// Helper function to handle API errors with user-friendly messages
async function handleAPIError(response: Response) {
  if (response.status === 401) {
    throw new Error('Authentication failed. Please make sure you are logged in with a Nostr account.');
  } else if (response.status === 402) {
    throw new Error('Insufficient credits. Please add credits to your account to use premium models, or use the free "tybalt" model.');
  } else if (response.status === 400) {
    try {
      const error = await response.json();
      if (error.error?.type === 'invalid_request_error') {
        // Handle specific validation errors
        if (error.error.code === 'minimum_amount_not_met') {
          throw new Error(`Minimum credit amount is $${error.error.minimum_amount}. Please increase your payment amount.`);
        } else if (error.error.code === 'unsupported_method') {
          throw new Error('Payment method not supported. Please use "stripe" or "lightning".');
        } else if (error.error.code === 'invalid_url') {
          throw new Error('Invalid redirect URL provided for Stripe payment.');
        }
      }
      throw new Error(`Invalid request: ${error.error?.message || error.details || error.error || 'Please check your request parameters.'}`);
    } catch {
      throw new Error('Invalid request. Please check your parameters and try again.');
    }
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

export function useShakespeare() {
  const { user } = useCurrentUser();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Clear error helper
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Chat completion function
  const sendChatMessage = useCallback(async (
    messages: ChatMessage[], 
    model: string = 'shakespeare',
    options?: Partial<ChatCompletionRequest>
  ): Promise<ChatCompletionResponse> => {
    if (!user) {
      throw new Error('User must be logged in to use AI features');
    }

    setIsLoading(true);
    setError(null);

    try {
      const requestBody: ChatCompletionRequest = {
        model,
        messages,
        ...options
      };

      const token = await createNIP98Token(
        'POST',
        `${SHAKESPEARE_API_URL}/chat/completions`,
        requestBody,
        user
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
      let errorMessage = 'An unexpected error occurred';
      
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === 'string') {
        errorMessage = err;
      }
      
      // Add context for common issues
      if (errorMessage.includes('Failed to fetch') || errorMessage.includes('Network')) {
        errorMessage = 'Network error: Please check your internet connection and try again.';
      } else if (errorMessage.includes('signer')) {
        errorMessage = 'Authentication error: Please make sure you are logged in with a Nostr account that supports signing.';
      }
      
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Streaming chat completion function
  const sendStreamingMessage = useCallback(async (
    messages: ChatMessage[], 
    model: string = 'shakespeare',
    onChunk: (chunk: string) => void,
    options?: Partial<ChatCompletionRequest>
  ): Promise<void> => {
    if (!user) {
      throw new Error('User must be logged in to use AI features');
    }

    setIsLoading(true);
    setError(null);

    try {
      const requestBody: ChatCompletionRequest = {
        model,
        messages,
        stream: true,
        ...options
      };

      const token = await createNIP98Token(
        'POST',
        `${SHAKESPEARE_API_URL}/chat/completions`,
        requestBody,
        user
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

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') return;
              
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  onChunk(content);
                }
              } catch {
                // Ignore parsing errors for incomplete chunks
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (err) {
      let errorMessage = 'An unexpected error occurred';
      
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === 'string') {
        errorMessage = err;
      }
      
      // Add context for common issues
      if (errorMessage.includes('Failed to fetch') || errorMessage.includes('Network')) {
        errorMessage = 'Network error: Please check your internet connection and try again.';
      } else if (errorMessage.includes('signer')) {
        errorMessage = 'Authentication error: Please make sure you are logged in with a Nostr account that supports signing.';
      }
      
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Get available models
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
        user
      );

      const response = await fetch(`${SHAKESPEARE_API_URL}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Nostr ${token}`,
        },
      });

      await handleAPIError(response);
      return await response.json();
    } catch (err) {
      let errorMessage = 'An unexpected error occurred';
      
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === 'string') {
        errorMessage = err;
      }
      
      // Add context for common issues
      if (errorMessage.includes('Failed to fetch') || errorMessage.includes('Network')) {
        errorMessage = 'Network error: Please check your internet connection and try again.';
      } else if (errorMessage.includes('signer')) {
        errorMessage = 'Authentication error: Please make sure you are logged in with a Nostr account that supports signing.';
      }
      
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  return {
    // State
    isLoading,
    error,
    isAuthenticated: !!user,
    
    // Actions
    sendChatMessage,
    sendStreamingMessage,
    getAvailableModels,
    clearError,
  };
}
