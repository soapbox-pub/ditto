import { describe, it, expect, vi, beforeEach, onTestFinished } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { AgentSession, SessionMessage } from '@soapbox.pub/nostr-canvas/devkit';

import { useAutoTitle } from './useAutoTitle';
import { AUTO_TITLE_MAX_TOKENS } from '@/lib/autoTitle';
import type { AIProviderProfile } from './useAIProviders';
import type { ChatSession } from './useChatSessions';

type AgentSnapshot = ReturnType<AgentSession['getSnapshot']>;

// The client factory is swapped for a controllable spy; sessionModelId stays
// real so the tests also prove the shakespeare/ prefix stripping.
const createSessionOpenAIClientMock = vi.hoisted(() => vi.fn());
const useCurrentUserMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/aiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/aiClient')>();
  return { ...actual, createSessionOpenAIClient: createSessionOpenAIClientMock };
});

vi.mock('./useCurrentUser', () => ({
  useCurrentUser: () => useCurrentUserMock(),
}));

// ─── Fixtures ───────────────────────────────────────────────────────────────

const PUBKEY = 'aa'.repeat(32);

/** A minimal agent snapshot with a completed user→assistant exchange. */
function completedExchangeSnapshot(messages: SessionMessage[]): AgentSnapshot {
  return {
    messages,
    streamingContent: '',
    streamingReasoning: '',
    isLoading: false,
    isCompacting: false,
    error: null,
    tokenUsage: null,
    estimatedPromptTokens: 0,
    estimatedCompletionTokens: 0,
    contextWindow: 4096,
    pendingInput: null,
  };
}

function makeSession(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    id: 's1',
    title: '',
    abilities: [],
    providerId: 'shakespeare',
    modelId: 'shakespeare/glm-4.5',
    createdAt: new Date(),
    ...overrides,
  };
}

function makeProfile(overrides: Partial<AIProviderProfile> = {}): AIProviderProfile {
  return {
    id: 'provider-a',
    kind: 'openrouter',
    name: 'My OpenRouter',
    baseURL: 'https://api.example.com/v1',
    apiKey: 'sk-test',
    models: [{ id: 'model-1', name: 'Model 1', contextWindow: 8192 }],
    syncEnabled: false,
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('useAutoTitle', () => {
  beforeEach(() => {
    createSessionOpenAIClientMock.mockReset();
    useCurrentUserMock.mockReset();
  });

  it("generates the title via the session's own custom-provider client and model", async () => {
    const profiles: AIProviderProfile[] = [makeProfile()];
    const session = makeSession({ providerId: 'provider-a', modelId: 'model-1' });
    const exchange: SessionMessage[] = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ];
    const create = vi.fn().mockResolvedValue({ choices: [{ message: { content: 'Generated Title' } }] });
    createSessionOpenAIClientMock.mockResolvedValue({ chat: { completions: { create } } });
    useCurrentUserMock.mockReturnValue({ user: { pubkey: PUBKEY } });

    const updateSession = vi.fn();
    renderHook(() =>
      useAutoTitle({
        sessions: [session],
        snapshots: { s1: completedExchangeSnapshot(exchange) },
        profiles,
        updateSession,
      }),
    );

    // The client is built for the session's own provider, never Shakespeare.
    await waitFor(() => expect(createSessionOpenAIClientMock).toHaveBeenCalled());
    expect(createSessionOpenAIClientMock).toHaveBeenCalledWith(session, profiles, { pubkey: PUBKEY });

    // The completion uses the session's own model id, not a Shakespeare one.
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'model-1', max_tokens: AUTO_TITLE_MAX_TOKENS, temperature: 0 }),
    );
    expect(updateSession).toHaveBeenCalledWith('s1', { title: 'Generated Title' });
  });

  it("titles a shakespeare session through the same unified client path, stripping the provider prefix", async () => {
    const session = makeSession();
    const exchange: SessionMessage[] = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ];
    const create = vi.fn().mockResolvedValue({ choices: [{ message: { content: 'Shakespeare Title' } }] });
    createSessionOpenAIClientMock.mockResolvedValue({ chat: { completions: { create } } });
    useCurrentUserMock.mockReturnValue({ user: { pubkey: PUBKEY } });

    const updateSession = vi.fn();
    renderHook(() =>
      useAutoTitle({
        sessions: [session],
        snapshots: { s1: completedExchangeSnapshot(exchange) },
        profiles: [],
        updateSession,
      }),
    );

    await waitFor(() => expect(createSessionOpenAIClientMock).toHaveBeenCalled());
    expect(createSessionOpenAIClientMock).toHaveBeenCalledWith(session, [], { pubkey: PUBKEY });

    // sessionModelId strips the picker's "shakespeare/" prefix.
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'glm-4.5', max_tokens: AUTO_TITLE_MAX_TOKENS, temperature: 0 }),
    );
    expect(updateSession).toHaveBeenCalledWith('s1', { title: 'Shakespeare Title' });
  });

  it('does not refire a failed title attempt until the messages array reference changes', async () => {
    const session = makeSession();
    const exchange: SessionMessage[] = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ];
    const create = vi.fn().mockRejectedValue(new Error('quota exceeded'));
    createSessionOpenAIClientMock.mockResolvedValue({ chat: { completions: { create } } });
    useCurrentUserMock.mockReturnValue({ user: { pubkey: PUBKEY } });
    // Registered for teardown, so a failed assertion below cannot leave the
    // console.error mock installed for the tests that follow.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    onTestFinished(() => errorSpy.mockRestore());

    const updateSession = vi.fn();
    const { rerender } = renderHook(
      (props: { messages: SessionMessage[] }) =>
        useAutoTitle({
          sessions: [session],
          snapshots: { s1: completedExchangeSnapshot(props.messages) },
          profiles: [],
          updateSession,
        }),
      { initialProps: { messages: exchange } },
    );

    // The first attempt fires and fails.
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    // Let the rejection settle so inFlight clears before the re-render.
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Same messages array reference: the guard must skip a new attempt.
    rerender({ messages: exchange });
    // Give a spurious retry time to reach the client before asserting it did not.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(create).toHaveBeenCalledTimes(1);

    // A new messages array reference does allow a new attempt.
    const followUp: SessionMessage[] = [...exchange, { role: 'user', content: 'follow-up' }];
    rerender({ messages: followUp });
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
  });
});
