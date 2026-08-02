import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { MemoryRouter } from 'react-router-dom';

import { AIChatPage } from './AIChatPage';
import type { AIProviderProfile } from '@/hooks/useAIProviders';
import { TAB_STORAGE_PREFIX } from '@/lib/chatTabsStorage';
import type { PersistedTab } from '@/lib/chatTabsStorage';

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
// observes actual "New Chat" behavior through localStorage.
const getAvailableModelsMock = vi.hoisted(() => vi.fn());
const sendMessageMock = vi.hoisted(() => vi.fn());
const clearActiveSessionMock = vi.hoisted(() => vi.fn());
const useAIProvidersMock = vi.hoisted(() => vi.fn());
const useCurrentUserMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useShakespeare', () => ({
  useShakespeare: () => ({
    getAvailableModels: getAvailableModelsMock,
    sendChatMessage: vi.fn(),
    sendStreamingMessage: vi.fn(),
    getCreditsBalance: vi.fn(),
    clearError: vi.fn(),
    isLoading: false,
    error: null,
    retryAfter: null,
    isAuthenticated: true,
  }),
  useShakespeareCredits: () => true,
}));

vi.mock('@/hooks/useAIProviders', () => ({
  useAIProviders: () => useAIProvidersMock(),
}));

vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => useCurrentUserMock(),
}));

vi.mock('@/hooks/useAppContext', () => ({
  useAppContext: () => ({ config: { appName: 'Ditto' } }),
}));

vi.mock('@/hooks/useToolRegistry', () => ({
  useToolRegistry: () => ({ buildSessionTools: () => [] }),
}));

vi.mock('@/hooks/useAgentSessions', () => ({
  useAgentSessions: () => ({
    snapshots: {},
    buildError: null,
    sendMessage: sendMessageMock,
    clearActiveSession: clearActiveSessionMock,
  }),
}));

vi.mock('@/hooks/useAutoTitle', () => ({
  useAutoTitle: () => {},
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
    getAvailableModelsMock.mockReset();
    getAvailableModelsMock.mockResolvedValue({ object: 'list', data: [] });
    sendMessageMock.mockReset();
    clearActiveSessionMock.mockReset();
    useAIProvidersMock.mockReset();
    useCurrentUserMock.mockReset();
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
});
