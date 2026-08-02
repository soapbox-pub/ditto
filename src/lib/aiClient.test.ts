import { describe, it, expect } from 'vitest';

import { sessionContextWindow } from './aiClient';
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
    messages: [],
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
