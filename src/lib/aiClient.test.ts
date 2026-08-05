import { describe, it, expect } from 'vitest';

import { sessionContextWindow, mapShakespeareErrors } from './aiClient';
import type { AIProviderProfile } from '@/hooks/useAIProviders';
import type { ChatSession } from '@/hooks/useChatSessions';
import type { Model } from '@/hooks/useShakespeare';

function makeSession(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    id: 'sess-1',
    title: '',
    abilities: [],
    providerId: 'shakespeare',
    modelId: 'shakespeare/sonnet',
    createdAt: new Date(),
    ...overrides,
  };
}

function makeShakespeareModel(overrides: Partial<Model> = {}): Model {
  return {
    id: 'sonnet',
    name: 'Sonnet',
    description: '',
    object: 'model',
    owned_by: 'shakespeare',
    created: 0,
    context_window: 200_000,
    pricing: { prompt: '0', completion: '0' },
    provider: 'shakespeare',
    fullId: 'shakespeare/sonnet',
    ...overrides,
  };
}

function makeProfile(overrides: Partial<AIProviderProfile> = {}): AIProviderProfile {
  return {
    id: 'openrouter',
    kind: 'openrouter',
    name: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: 'sk-test',
    models: [{ id: 'model-known', name: 'Known', contextWindow: 128_000 }],
    syncEnabled: true,
    ...overrides,
  };
}

describe('sessionContextWindow', () => {
  it('returns the recorded context window for a known Shakespeare model', () => {
    const session = makeSession({ modelId: 'shakespeare/sonnet' });
    const models = [makeShakespeareModel()];
    expect(sessionContextWindow(session, models, [])).toBe(200_000);
  });

  it('returns a conservative non-zero fallback when the Shakespeare model is unknown', () => {
    // Regression: an unknown model previously resolved to 0, which
    // AgentSession treats as "no proactive compaction" (its guard is
    // `if (this.contextWindow && ...)`), so a long session would hit the
    // provider's hard ceiling instead of compacting early.
    const session = makeSession({ modelId: 'shakespeare/nonexistent' });
    const fallback = sessionContextWindow(session, [makeShakespeareModel()], []);
    expect(fallback).toBeGreaterThan(0);
  });

  it('returns the recorded context window for a known BYO provider model', () => {
    const session = makeSession({ providerId: 'openrouter', modelId: 'model-known' });
    const profile = makeProfile();
    expect(sessionContextWindow(session, [], [profile])).toBe(128_000);
  });

  it('returns a conservative non-zero fallback when a BYO model has no recorded context window', () => {
    const session = makeSession({ providerId: 'openrouter', modelId: 'model-unknown' });
    const profile = makeProfile({
      models: [{ id: 'model-unknown', name: 'Unknown' }],
    });
    const fallback = sessionContextWindow(session, [], [profile]);
    expect(fallback).toBeGreaterThan(0);
  });

  it('returns a conservative non-zero fallback when the BYO provider is unknown', () => {
    const session = makeSession({ providerId: 'nobody', modelId: 'model-x' });
    const fallback = sessionContextWindow(session, [], [makeProfile()]);
    expect(fallback).toBeGreaterThan(0);
  });
});

describe('mapShakespeareErrors', () => {
  it('passes non-error responses through untouched', async () => {
    const response = new Response('ok', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    expect(await mapShakespeareErrors(response)).toBe(response);
  });

  it('carries the original headers onto a rate-limit response', async () => {
    const response = new Response(JSON.stringify({ error: { message: 'slow down' } }), {
      status: 429,
      headers: { 'Retry-After': '30', 'X-Request-Id': 'req-1' },
    });
    const mapped = await mapShakespeareErrors(response);
    expect(mapped.status).toBe(429);
    // The SDK's backoff logic reads Retry-After off the response headers.
    expect(mapped.headers.get('Retry-After')).toBe('30');
    expect(mapped.headers.get('X-Request-Id')).toBe('req-1');
    // The replacement body is JSON, so Content-Type is set to match it.
    expect(mapped.headers.get('Content-Type')).toBe('application/json');
  });

  it('maps a quota-exhaustion body to the credits message and keeps the status', async () => {
    const response = new Response(JSON.stringify({ code: 'insufficient_quota' }), {
      status: 402,
      headers: { 'Retry-After': '3600' },
    });
    const mapped = await mapShakespeareErrors(response);
    const body = (await mapped.json()) as { error: { message: string } };
    expect(mapped.status).toBe(402);
    expect(mapped.headers.get('Retry-After')).toBe('3600');
    expect(body.error.message).toContain('credits');
  });
});
