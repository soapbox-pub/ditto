import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { MemoryRouter } from 'react-router-dom';

import type { AgentSession, SessionMessage } from '@soapbox.pub/nostr-canvas/devkit';
import { nip19 } from 'nostr-tools';

import { AIChatPage } from './AIChatPage';
import type { AIProviderProfile } from '@/hooks/useAIProviders';
import type { Model } from '@/hooks/useShakespeare';
import { TAB_STORAGE_PREFIX } from '@/lib/chatTabsStorage';
import type { PersistedTab } from '@/lib/chatTabsStorage';

type AgentSnapshot = ReturnType<AgentSession['getSnapshot']>;

// @floating-ui/dom's autoUpdate instantiates ResizeObserver and
// IntersectionObserver when a Radix overlay opens. The shared setup mocks
// (vi.fn with arrow implementations) are not constructible in vitest 4, so
// provide real classes for this file's tests.
class MockObserver implements ResizeObserver, IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds: number[] = [];
  takeRecords = vi.fn();
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

// The page's AI hooks are swapped for controllable spies. Everything else —
// useChatSessions and the tab persistence layer — stays real, so the test
// observes actual "New Chat" behavior through localStorage. useAutoTitle is
// NOT mocked: the auto-title regression test needs the real hook to observe a
// session's completed exchange and fire the session-client title-generation
// call.
const getAvailableModelsMock = vi.hoisted(() => vi.fn());
const sendMessageMock = vi.hoisted(() => vi.fn());
const createSessionOpenAIClientMock = vi.hoisted(() => vi.fn());
const clearActiveSessionMock = vi.hoisted(() => vi.fn());
const useAgentSessionsMock = vi.hoisted(() => vi.fn());
const useAIProvidersMock = vi.hoisted(() => vi.fn());
const useCurrentUserMock = vi.hoisted(() => vi.fn());
const useShakespeareCreditsMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useShakespeare', () => ({
  useShakespeare: () => ({
    getAvailableModels: getAvailableModelsMock,
    sendStreamingMessage: vi.fn(),
    getCreditsBalance: vi.fn(),
    clearError: vi.fn(),
    isLoading: false,
    error: null,
    retryAfter: null,
    isAuthenticated: true,
  }),
  useShakespeareCredits: () => useShakespeareCreditsMock(),
}));

// useAutoTitle builds each session's client via createSessionOpenAIClient;
// sessionModelId stays real so the test exercises the real prefix stripping.
vi.mock('@/lib/aiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/aiClient')>();
  return { ...actual, createSessionOpenAIClient: createSessionOpenAIClientMock };
});

vi.mock('@/hooks/useAIProviders', () => ({
  useAIProviders: () => useAIProvidersMock(),
}));

vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => useCurrentUserMock(),
}));

// NostrMention (used by the user-message and markdown identifier paths) needs
// author data and a profile route. The page's own hooks are already mocked;
// these two make a mention render without a NostrProvider.
vi.mock('@/hooks/useAuthor', () => ({
  useAuthor: () => ({ data: undefined }),
}));

vi.mock('@/hooks/useProfileUrl', () => ({
  useProfileUrl: () => '/profile/placeholder',
}));

vi.mock('@/hooks/useAppContext', () => ({
  useAppContext: () => ({ config: { appName: 'Ditto' } }),
}));

vi.mock('@/hooks/useToolRegistry', () => ({
  useToolRegistry: () => ({ buildSessionTools: () => [] }),
}));

// The agent snapshots returned here drive both the rendered message list and
// useAutoTitle's exchange-completion check.
vi.mock('@/hooks/useAgentSessions', () => ({
  useAgentSessions: () => useAgentSessionsMock(),
}));

vi.mock('@/contexts/LayoutContext', () => ({
  useLayoutOptions: () => {},
}));

vi.mock('@/components/MentionAutocomplete', () => ({
  MentionAutocomplete: () => null,
}));

// ─── Fixtures ───────────────────────────────────────────────────────────────

function makeProfile(overrides: Partial<AIProviderProfile> = {}): AIProviderProfile {
  return {
    id: crypto.randomUUID(),
    kind: 'openrouter',
    name: 'Provider',
    baseURL: 'https://api.example.com/v1',
    apiKey: 'sk-test',
    models: [],
    syncEnabled: false,
    ...overrides,
  };
}

/** A model exactly as the mocked getAvailableModels resolves it (with provider prefix). */
function shakespeareModel(id: string, pricing: { prompt: string; completion: string }): Model {
  return {
    id,
    name: id,
    description: '',
    object: 'model',
    owned_by: 'shakespeare',
    created: 0,
    context_window: 4096,
    pricing,
    provider: 'shakespeare',
    fullId: `shakespeare/${id}`,
  };
}

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

/** A snapshot still processing a turn: the agent is loading. */
function busySnapshot(messages: SessionMessage[], isLoading = true): AgentSnapshot {
  return { ...completedExchangeSnapshot(messages), isLoading };
}

const PUBKEY = 'aa'.repeat(32);

/** Read back the persisted tabs for a pubkey scope, oldest first. */
function readStoredTabs(pubkey: string): PersistedTab[] {
  const tabs: PersistedTab[] = [];
  const segment = `${TAB_STORAGE_PREFIX}${pubkey}.`;
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key?.startsWith(segment)) continue;
    const raw = localStorage.getItem(key);
    if (raw) tabs.push(JSON.parse(raw) as PersistedTab);
  }
  tabs.sort((a, b) => a.createdAt - b.createdAt);
  return tabs;
}

/**
 * Persist a tab and point useAgentSessions at the given snapshot so the page
 * renders it as the active session's thread.
 */
function stubActiveSession(tabId: string, snapshot: AgentSnapshot): void {
  const tab: PersistedTab = {
    id: tabId,
    title: '',
    abilities: [],
    providerId: 'shakespeare',
    modelId: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    agent: { messages: [], pendingInput: null, pendingToolCalls: [] },
  };
  localStorage.setItem(`${TAB_STORAGE_PREFIX}${PUBKEY}.${tabId}`, JSON.stringify(tab));
  useAgentSessionsMock.mockReturnValue({
    snapshots: { [tabId]: snapshot },
    buildError: null,
    sendMessage: sendMessageMock,
    clearActiveSession: clearActiveSessionMock,
  });
}

function renderPage() {
  return render(
    <IntlProvider locale="en" onError={() => {}}>
      <MemoryRouter>
        <AIChatPage />
      </MemoryRouter>
    </IntlProvider>,
  );
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('AIChatPage', () => {
  beforeEach(() => {
    localStorage.clear();
    globalThis.IntersectionObserver = MockObserver as unknown as typeof IntersectionObserver;
    globalThis.ResizeObserver = MockObserver as unknown as typeof ResizeObserver;
    // jsdom does not implement scrollIntoView; the page's scroll-to-bottom
    // effect calls it once rendered messages fill the thread.
    Element.prototype.scrollIntoView = vi.fn();
    getAvailableModelsMock.mockReset();
    getAvailableModelsMock.mockResolvedValue({ object: 'list', data: [] });
    sendMessageMock.mockReset();
    createSessionOpenAIClientMock.mockReset();
    createSessionOpenAIClientMock.mockResolvedValue({
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({ choices: [{ message: { content: 'Generated Title' } }] }),
        },
      },
    });
    clearActiveSessionMock.mockReset();
    useAgentSessionsMock.mockReset();
    useAgentSessionsMock.mockReturnValue({
      snapshots: {},
      buildError: null,
      sendMessage: sendMessageMock,
      clearActiveSession: clearActiveSessionMock,
    });
    useAIProvidersMock.mockReset();
    useCurrentUserMock.mockReset();
    useShakespeareCreditsMock.mockReset();
    useShakespeareCreditsMock.mockReturnValue(true); // default: shakespeare balance is fine
  });

  it("'New Chat' starts on the first configured provider, not the active session's provider", async () => {
    const profiles: AIProviderProfile[] = [
      makeProfile({ id: 'provider-a', name: 'My OpenRouter' }),
      makeProfile({ id: 'provider-b', name: 'DeepSeek' }),
    ];
    // The restored active session sits on the zero-config shakespeare
    // provider (e.g. it ran out of credits). New Chat must not clone it.
    const oldTab: PersistedTab = {
      id: 'old-tab',
      title: 'Old shakespeare chat',
      abilities: [],
      providerId: 'shakespeare',
      modelId: 'shakespeare/cheap-model',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      agent: { messages: [], pendingInput: null, pendingToolCalls: [] },
    };
    localStorage.setItem(`${TAB_STORAGE_PREFIX}${PUBKEY}.old-tab`, JSON.stringify(oldTab));

    useCurrentUserMock.mockReturnValue({ user: { pubkey: PUBKEY } });
    useAIProvidersMock.mockReturnValue({ profiles });

    renderPage();

    // The stored shakespeare tab is restored as the active session.
    expect(screen.getByRole('button', { name: 'Old shakespeare chat' })).toBeInTheDocument();

    // Let the mount-time model fetch settle so its state updates land inside act.
    await waitFor(() => expect(getAvailableModelsMock).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));

    // The new tab defaults to the first configured provider with an empty
    // modelId, never cloning the active session's shakespeare provider/model.
    const tabs = readStoredTabs(PUBKEY);
    expect(tabs).toHaveLength(2);
    const newTab = tabs.find((t) => t.id !== 'old-tab');
    expect(newTab).toBeDefined();
    expect(newTab!.providerId).toBe('provider-a');
    expect(newTab!.modelId).toBe('');

    // The provider selector reflects the new default provider.
    expect(screen.getAllByRole('combobox')[0]).toHaveTextContent('My OpenRouter');
  });

  it("does not hide the input area when the active session is on a non-shakespeare provider with a zero shakespeare balance", async () => {
    const profiles: AIProviderProfile[] = [
      makeProfile({ id: 'provider-a', name: 'My OpenRouter' }),
    ];
    // The active session runs on a configured third-party provider, so the
    // shakespeare credit balance is irrelevant to it.
    const tab: PersistedTab = {
      id: 'provider-tab',
      title: 'Provider chat',
      abilities: [],
      providerId: 'provider-a',
      modelId: 'provider-a/model-1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      agent: { messages: [], pendingInput: null, pendingToolCalls: [] },
    };
    localStorage.setItem(`${TAB_STORAGE_PREFIX}${PUBKEY}.provider-tab`, JSON.stringify(tab));

    useShakespeareCreditsMock.mockReturnValue(false);
    useCurrentUserMock.mockReturnValue({ user: { pubkey: PUBKEY } });
    useAIProvidersMock.mockReturnValue({ profiles });

    renderPage();

    // Let the mount-time model fetch settle so its state updates land inside act.
    await waitFor(() => expect(getAvailableModelsMock).toHaveBeenCalled());

    // The input area stays available: the credits gate is scoped to the
    // active session's provider, not the shakespeare balance.
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    // No "need credits" prompt on a provider that does not use the shakespeare balance.
    expect(screen.queryByText(/You need credits to chat with Dork/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Get Credits/ })).not.toBeInTheDocument();
  });

  it("hides the input area and shows the credits prompt when the active session is on shakespeare with no credits", async () => {
    // No profiles and no stored tabs: the bootstrap session lands on the
    // zero-config shakespeare provider.
    useShakespeareCreditsMock.mockReturnValue(false);
    useCurrentUserMock.mockReturnValue({ user: { pubkey: PUBKEY } });
    useAIProvidersMock.mockReturnValue({ profiles: [] });

    renderPage();

    // Let the mount-time model fetch settle so its state updates land inside act.
    await waitFor(() => expect(getAvailableModelsMock).toHaveBeenCalled());

    // A genuine shakespeare session out of credits keeps the gate: no input
    // area, and the empty state prompts for credits.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText(/You need credits to chat with Dork/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Get Credits/ })).toBeInTheDocument();
  });

  it("never writes a Shakespeare model id into a custom-provider session's empty modelId", async () => {
    const profiles: AIProviderProfile[] = [
      makeProfile({ id: 'provider-a', name: 'My OpenRouter', models: [{ id: 'model-1', name: 'Model 1' }] }),
    ];
    useCurrentUserMock.mockReturnValue({ user: { pubkey: PUBKEY } });
    useAIProvidersMock.mockReturnValue({ profiles });
    // The mount fetch resolves with the Shakespeare model list.
    getAvailableModelsMock.mockResolvedValue({
      object: 'list',
      data: [
        shakespeareModel('claude-sonnet-4.5', { prompt: '4', completion: '16' }),
        shakespeareModel('glm-4.5', { prompt: '1.5', completion: '7.5' }),
      ],
    });

    renderPage();

    // No stored tabs: the bootstrap session lands on the first configured
    // provider with an empty modelId.
    await waitFor(() => expect(getAvailableModelsMock).toHaveBeenCalled());

    // The modelId must come from the provider's own model list, never from
    // the Shakespeare list.
    const tabs = readStoredTabs(PUBKEY);
    expect(tabs).toHaveLength(1);
    expect(tabs[0].providerId).toBe('provider-a');
    expect(tabs[0].modelId).not.toMatch(/^shakespeare\//);
    expect(tabs[0].modelId).toBe('model-1');
  });

  it("auto-fills a fresh New Chat session on a custom provider with that provider's first model", async () => {
    const profiles: AIProviderProfile[] = [
      makeProfile({ id: 'provider-a', name: 'My OpenRouter', models: [{ id: 'model-1', name: 'Model 1' }] }),
    ];
    // The restored active session sits on shakespeare (e.g. it ran out of
    // credits). New Chat must start on the first configured provider.
    const oldTab: PersistedTab = {
      id: 'old-tab',
      title: 'Old shakespeare chat',
      abilities: [],
      providerId: 'shakespeare',
      modelId: 'shakespeare/glm-4.5',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      agent: { messages: [], pendingInput: null, pendingToolCalls: [] },
    };
    localStorage.setItem(`${TAB_STORAGE_PREFIX}${PUBKEY}.old-tab`, JSON.stringify(oldTab));

    useCurrentUserMock.mockReturnValue({ user: { pubkey: PUBKEY } });
    useAIProvidersMock.mockReturnValue({ profiles });
    getAvailableModelsMock.mockResolvedValue({
      object: 'list',
      data: [shakespeareModel('glm-4.5', { prompt: '1.5', completion: '7.5' })],
    });

    renderPage();

    await waitFor(() => expect(getAvailableModelsMock).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));

    // The new tab defaults to the first configured provider with an empty
    // modelId; the provider-aware auto-select fills it from the provider's
    // own model list.
    await waitFor(() => {
      const tabs = readStoredTabs(PUBKEY);
      const newTab = tabs.find((t) => t.id !== 'old-tab');
      expect(newTab).toBeDefined();
      expect(newTab!.providerId).toBe('provider-a');
      expect(newTab!.modelId).toBe('model-1');
    });
  });

  it("still defaults an empty shakespeare session to the cheapest Shakespeare model", async () => {
    // No profiles and no stored tabs: the bootstrap session lands on the
    // zero-config shakespeare provider with an empty modelId.
    useCurrentUserMock.mockReturnValue({ user: { pubkey: PUBKEY } });
    useAIProvidersMock.mockReturnValue({ profiles: [] });
    getAvailableModelsMock.mockResolvedValue({
      object: 'list',
      data: [
        shakespeareModel('claude-sonnet-4.5', { prompt: '4', completion: '16' }),
        shakespeareModel('glm-4.5', { prompt: '1.5', completion: '7.5' }),
      ],
    });

    renderPage();

    await waitFor(() => expect(getAvailableModelsMock).toHaveBeenCalled());

    // The shakespeare session still defaults to the cheapest fetched model.
    const tabs = readStoredTabs(PUBKEY);
    expect(tabs).toHaveLength(1);
    expect(tabs[0].providerId).toBe('shakespeare');
    expect(tabs[0].modelId).toBe('shakespeare/glm-4.5');
  });

  it("switches a still-untouched bootstrap session off shakespeare once synced provider profiles arrive", async () => {
    // No profiles yet on mount, as if the NIP-78 encrypted-settings merge
    // has not resolved: the bootstrap session lands on the zero-config
    // shakespeare fallback.
    useCurrentUserMock.mockReturnValue({ user: { pubkey: PUBKEY } });
    useAIProvidersMock.mockReturnValue({ profiles: [] });
    getAvailableModelsMock.mockResolvedValue({
      object: 'list',
      data: [shakespeareModel('glm-4.5', { prompt: '1.5', completion: '7.5' })],
    });

    const { rerender } = renderPage();

    await waitFor(() => {
      const tabs = readStoredTabs(PUBKEY);
      expect(tabs).toHaveLength(1);
      expect(tabs[0].providerId).toBe('shakespeare');
    });

    // The encrypted-settings merge resolves shortly after mount: profiles
    // becomes non-empty. The still-untouched bootstrap session must switch
    // to the newly available provider instead of staying stuck on
    // shakespeare until the user happens to open another tab.
    const profiles: AIProviderProfile[] = [
      makeProfile({ id: 'provider-a', name: 'My OpenRouter', models: [{ id: 'model-1', name: 'Model 1' }] }),
    ];
    useAIProvidersMock.mockReturnValue({ profiles });
    rerender(
      <IntlProvider locale="en" onError={() => {}}>
        <MemoryRouter>
          <AIChatPage />
        </MemoryRouter>
      </IntlProvider>,
    );

    await waitFor(() => {
      const tabs = readStoredTabs(PUBKEY);
      expect(tabs[0].providerId).toBe('provider-a');
      expect(tabs[0].modelId).toBe('model-1');
    });
  });

  it("auto-titles a custom-provider session after its first exchange completes", async () => {
    const profiles: AIProviderProfile[] = [
      makeProfile({ id: 'provider-a', name: 'My OpenRouter', models: [{ id: 'model-1', name: 'Model 1' }] }),
    ];
    // The active session sits on a custom provider with an empty modelId (a
    // bootstrap or New Chat session). Its agent snapshot carries a completed
    // first exchange: a user message and an assistant reply.
    const tab: PersistedTab = {
      id: 'provider-tab',
      title: '',
      abilities: [],
      providerId: 'provider-a',
      modelId: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      agent: { messages: [], pendingInput: null, pendingToolCalls: [] },
    };
    localStorage.setItem(`${TAB_STORAGE_PREFIX}${PUBKEY}.provider-tab`, JSON.stringify(tab));

    const exchange: SessionMessage[] = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ];
    useAgentSessionsMock.mockReturnValue({
      snapshots: { 'provider-tab': completedExchangeSnapshot(exchange) },
      buildError: null,
      sendMessage: sendMessageMock,
      clearActiveSession: clearActiveSessionMock,
    });

    useCurrentUserMock.mockReturnValue({ user: { pubkey: PUBKEY } });
    useAIProvidersMock.mockReturnValue({ profiles });
    getAvailableModelsMock.mockResolvedValue({
      object: 'list',
      data: [shakespeareModel('glm-4.5', { prompt: '1.5', completion: '7.5' })],
    });

    renderPage();

    await waitFor(() => expect(getAvailableModelsMock).toHaveBeenCalled());

    // The session's modelId resolves to the provider's own first model, not
    // a Shakespeare id.
    await waitFor(() => {
      const tabs = readStoredTabs(PUBKEY);
      const sessionTab = tabs.find((t) => t.id === 'provider-tab');
      expect(sessionTab).toBeDefined();
      expect(sessionTab!.modelId).toBe('model-1');
    });

    // The completed exchange triggers useAutoTitle's session-client title call.
    await waitFor(() => expect(createSessionOpenAIClientMock).toHaveBeenCalled());

    // The generated title lands on the persisted tab.
    await waitFor(() => {
      const tabs = readStoredTabs(PUBKEY);
      const sessionTab = tabs.find((t) => t.id === 'provider-tab');
      expect(sessionTab?.title).toBe('Generated Title');
    });
  });

  it("shows the thinking indicator while a plain assistant reply streams", async () => {
    const messages: SessionMessage[] = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'streaming reply' },
    ];
    stubActiveSession('streaming-tab', busySnapshot(messages));
    useCurrentUserMock.mockReturnValue({ user: { pubkey: PUBKEY } });
    useAIProvidersMock.mockReturnValue({ profiles: [] });

    renderPage();

    // Let the mount-time model fetch settle so its state updates land inside act.
    await waitFor(() => expect(getAvailableModelsMock).toHaveBeenCalled());

    // The last message is a plain assistant reply, so the indicator shows the
    // generic thinking caption, not a tool label.
    expect(screen.getByText('hi')).toBeInTheDocument();
    expect(screen.getByText(/thinking/i)).toBeInTheDocument();
  });

  it("shows the running-tool caption while a tool call is in flight", async () => {
    const messages: SessionMessage[] = [
      { role: 'user', content: 'hi' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name: 'nak', arguments: JSON.stringify({ action: 'req', kinds: [1], limit: 5 }) },
          },
        ],
      },
    ];
    stubActiveSession('nak-tab', busySnapshot(messages));
    useCurrentUserMock.mockReturnValue({ user: { pubkey: PUBKEY } });
    useAIProvidersMock.mockReturnValue({ profiles: [] });

    renderPage();

    // Let the mount-time model fetch settle so its state updates land inside act.
    await waitFor(() => expect(getAvailableModelsMock).toHaveBeenCalled());

    // The unresolved nak call names the caption; the generic caption is absent.
    expect(screen.getByText('hi')).toBeInTheDocument();
    expect(screen.getByText(/looking up nostr data/i)).toBeInTheDocument();
    expect(screen.queryByText(/thinking/i)).not.toBeInTheDocument();
  });

  it("renders no indicator when the agent is not loading", async () => {
    const messages: SessionMessage[] = [
      { role: 'user', content: 'hi' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name: 'nak', arguments: '{}' },
          },
        ],
      },
    ];
    stubActiveSession('idle-tab', busySnapshot(messages, false));
    useCurrentUserMock.mockReturnValue({ user: { pubkey: PUBKEY } });
    useAIProvidersMock.mockReturnValue({ profiles: [] });

    renderPage();

    // Let the mount-time model fetch settle so its state updates land inside act.
    await waitFor(() => expect(getAvailableModelsMock).toHaveBeenCalled());

    // No loading means no indicator, whatever the message roles.
    expect(screen.getByText('hi')).toBeInTheDocument();
    expect(screen.queryByText(/thinking/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/looking up nostr data/i)).not.toBeInTheDocument();
  });

  it("renders an npub in a user message as a mention and keeps an nsec plain", async () => {
    const NPUB = nip19.npubEncode(PUBKEY);
    const NSEC = nip19.nsecEncode(new Uint8Array(32).fill(7));
    const messages: SessionMessage[] = [
      { role: 'user', content: `ping ${NPUB}\nkeep ${NSEC}` },
      { role: 'assistant', content: 'ok' },
    ];
    stubActiveSession('mention-tab', completedExchangeSnapshot(messages));
    useCurrentUserMock.mockReturnValue({ user: { pubkey: PUBKEY } });
    useAIProvidersMock.mockReturnValue({ profiles: [] });

    renderPage();

    // Let the mount-time model fetch settle so its state updates land inside act.
    await waitFor(() => expect(getAvailableModelsMock).toHaveBeenCalled());

    // The npub becomes a mention link to the (mocked) profile route.
    const mention = screen.getByRole('link', { name: '@Anonymous' });
    expect(mention).toHaveAttribute('href', '/profile/placeholder');

    // The paragraph keeps the typed newline; the nsec stays plain text and
    // never becomes a link.
    expect(mention.closest('p')?.textContent).toBe(`ping @Anonymous\nkeep ${NSEC}`);
    expect(screen.queryByRole('link', { name: new RegExp(`^${NSEC}`) })).not.toBeInTheDocument();
  });
});
