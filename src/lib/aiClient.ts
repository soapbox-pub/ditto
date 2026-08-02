import type OpenAI from 'openai';
import type { NUser } from '@nostrify/react/login';
import { createAIClient } from '@soapbox.pub/nostr-canvas/devkit';

import { createNIP98Token, SHAKESPEARE_API_URL } from '@/lib/shakespeareApi';
import type { AIProviderProfile } from '@/hooks/useAIProviders';
import type { ChatSession } from '@/hooks/useChatSessions';
import type { Model } from '@/hooks/useShakespeare';

/**
 * OpenAI client for the zero-config Shakespeare endpoint. Auth is per-request:
 * a fresh NIP-98 token is signed with the user's key and attached as the
 * Authorization header, so the SDK never holds a static API key.
 */
export async function createShakespeareOpenAIClient(user: NUser): Promise<OpenAI> {
  const { default: OpenAI } = await import('openai');
  return new OpenAI({
    baseURL: SHAKESPEARE_API_URL,
    apiKey: 'shakespeare',
    dangerouslyAllowBrowser: true,
    fetch: async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const method = init?.method ?? 'GET';
      // Re-parse the SDK's serialized body so the payload hash matches the
      // exact bytes that went on the wire (JSON.stringify round-trips stably).
      let body: unknown;
      if (init?.body) {
        try {
          body = JSON.parse(String(init.body));
        } catch {
          body = String(init.body);
        }
      }
      const token = await createNIP98Token(method, url, body, user);
      const headers = new Headers(init?.headers);
      headers.set('Authorization', `Nostr ${token}`);
      headers.set('Content-Type', 'application/json');
      const response = await fetch(input, { ...init, headers });
      return mapShakespeareErrors(response);
    },
  });
}

/**
 * Turn Shakespeare's quota/rate responses into an error body the OpenAI SDK
 * surfaces to AgentSession as a message the chat UI recognizes.
 */
async function mapShakespeareErrors(response: Response): Promise<Response> {
  if (response.status !== 402 && response.status !== 429) return response;

  let message = 'Rate limited. Please wait a moment and try again.';
  if (response.status === 402) {
    message = "You've run out of credits. Add more on shakespeare.diy to keep chatting.";
  } else {
    try {
      const parsed = (await response.json()) as { code?: string; error?: { code?: string } };
      if (parsed.code === 'insufficient_quota' || parsed.error?.code === 'insufficient_quota') {
        message = "You've run out of credits. Add more on shakespeare.diy to keep chatting.";
      }
    } catch {
      // Non-JSON body — keep the rate-limit default.
    }
  }

  return new Response(JSON.stringify({ error: { message, type: 'invalid_request_error', code: 'rate_limit' } }), {
    status: response.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Build the OpenAI client a session's AgentSession should use. */
export async function createSessionOpenAIClient(
  session: ChatSession,
  profiles: AIProviderProfile[],
  user: NUser,
): Promise<OpenAI> {
  if (session.providerId === 'shakespeare') {
    return createShakespeareOpenAIClient(user);
  }

  const profile = profiles.find((p) => p.id === session.providerId);
  if (!profile) {
    throw new Error(`Unknown AI provider: ${session.providerId}. Pick a provider from the list or switch back to Shakespeare.`);
  }
  return createAIClient({
    id: profile.kind,
    name: profile.name,
    baseURL: profile.baseURL,
    apiKey: profile.apiKey,
    models: profile.models,
  });
}

/** The model id the API expects. Session ids for Shakespeare carry a "shakespeare/" prefix for the picker; the endpoint wants the bare id. */
export function sessionModelId(session: ChatSession): string {
  return session.providerId === 'shakespeare' ? session.modelId.replace(/^shakespeare\//, '') : session.modelId;
}

/**
 * Conservative fallback for a model whose context window is unknown (e.g. a
 * BYO provider that never recorded one, or a Shakespeare model missing from
 * the fetched list). AgentSession skips proactive compaction when the window
 * is 0, so an unknown window must still resolve to a real number: compacting
 * early is cheap, letting a prompt hit the provider's hard ceiling is not.
 */
const UNKNOWN_MODEL_CONTEXT_WINDOW = 32_768;

/** Context-window hint for the session's model, or a conservative default when unknown. */
export function sessionContextWindow(
  session: ChatSession,
  models: Model[],
  profiles: AIProviderProfile[],
): number {
  if (session.providerId === 'shakespeare') {
    return models.find((m) => m.fullId === session.modelId)?.context_window ?? UNKNOWN_MODEL_CONTEXT_WINDOW;
  }
  const profile = profiles.find((p) => p.id === session.providerId);
  return profile?.models.find((m) => m.id === session.modelId)?.contextWindow ?? UNKNOWN_MODEL_CONTEXT_WINDOW;
}
