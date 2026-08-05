import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { IntlProvider } from 'react-intl';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ModelListEditor, SettingsAIPage } from './SettingsAIPage';
import type { AIProviderProfile } from '@/hooks/useAIProviders';

// The page's AI hooks are swapped for controllable spies. ModelListEditor
// needs nothing else: all strings have inline English defaultMessages and
// the toast store is module-level, so the full TestApp/Nostr stack is
// unnecessary here.
const useAIProvidersMock = vi.hoisted(() => vi.fn());
const useAppContextMock = vi.hoisted(() => vi.fn());
const useCurrentUserMock = vi.hoisted(() => vi.fn());
const useShakespeareMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useAIProviders', () => ({
  useAIProviders: () => useAIProvidersMock(),
}));

vi.mock('@/hooks/useAppContext', () => ({
  useAppContext: () => useAppContextMock(),
}));

// The built-in Shakespeare card reads the signed-in user and the Shakespeare
// client. Both are mocked here for the same reason the two hooks above are:
// this file deliberately avoids standing up the full TestApp/Nostr stack.
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => useCurrentUserMock(),
}));

vi.mock('@/hooks/useShakespeare', () => ({
  useShakespeare: () => useShakespeareMock(),
}));

// @floating-ui/dom's `autoUpdate` instantiates `ResizeObserver` and
// `IntersectionObserver` when opening the Radix dropdown. The shared setup
// mocks (vi.fn with arrow implementations) are not constructible in vitest 4,
// so provide real classes for this file's tests.
class MockObserver implements ResizeObserver, IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds = [];
  takeRecords = vi.fn();
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeEach(() => {
  globalThis.IntersectionObserver = MockObserver as unknown as typeof IntersectionObserver;
  globalThis.ResizeObserver = MockObserver as unknown as typeof ResizeObserver;
});

// Minimal wrapper: ModelListEditor only needs react-intl.
function renderEditor(models: AIProviderProfile['models']) {
  function Harness() {
    const [active, setActive] = useState<AIProviderProfile['models']>(models);
    return <ModelListEditor models={active} onModelsChange={setActive} />;
  }
  return render(
    <IntlProvider locale="en" onError={() => {}}>
      <Harness />
    </IntlProvider>,
  );
}

function makeProfile(overrides: Partial<AIProviderProfile> = {}): AIProviderProfile {
  return {
    id: 'profile-1',
    kind: 'openrouter',
    name: 'My OpenRouter',
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: 'sk-test',
    models: [],
    syncEnabled: false,
    ...overrides,
  };
}

/**
 * Renders the page with a mocked provider store; returns the delete spy.
 * Logged out by default: the Shakespeare card then skips both of its
 * queries, so the custom-provider tests stay focused on the profile list.
 * Card-state tests opt in with `loggedIn` and drive the two queries through
 * `credits` and `models`.
 */
function renderPage(
  profiles: AIProviderProfile[],
  options: {
    loggedIn?: boolean;
    credits?: () => Promise<unknown>;
    models?: () => Promise<unknown>;
  } = {},
) {
  const deleteProfile = vi.fn().mockResolvedValue(true);
  useAppContextMock.mockReturnValue({ config: { appName: 'Ditto' } });
  useAIProvidersMock.mockReturnValue({
    profiles,
    addProfile: vi.fn(),
    updateProfile: vi.fn().mockResolvedValue(true),
    deleteProfile,
    duplicateProfile: vi.fn(),
    isLoading: false,
    hasNip44Support: true,
  });
  useCurrentUserMock.mockReturnValue(
    options.loggedIn ? { user: { pubkey: 'aa'.repeat(32) } } : { user: undefined },
  );
  useShakespeareMock.mockReturnValue({
    getCreditsBalance: options.credits ?? vi.fn(),
    getAvailableModels: options.models ?? vi.fn(),
  });
  render(
    // retryDelay 1ms keeps the card's per-query `retry: 2` from stalling
    // the error-state tests on real-time backoff.
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: () => 1 } } })}>
      <IntlProvider locale="en" onError={() => {}}>
        <MemoryRouter>
          <SettingsAIPage />
        </MemoryRouter>
      </IntlProvider>
    </QueryClientProvider>,
  );
  return deleteProfile;
}

const FIXTURES: AIProviderProfile['models'] = [
  { id: 'gpt-4o', name: 'GPT-4o' },
  { id: 'claude-3.5', name: 'Claude 3.5' },
];

describe('ModelListEditor', () => {
  it('renders each active model in a row with a remove button', () => {
    renderEditor(FIXTURES);

    expect(screen.getByText('GPT-4o')).toBeInTheDocument();
    expect(screen.getByText('Claude 3.5')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove GPT-4o' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Claude 3.5' })).toBeInTheDocument();
  });

  it('removing a model drops it from the active list but keeps it re-addable', () => {
    renderEditor(FIXTURES);

    fireEvent.click(screen.getByRole('button', { name: 'Remove GPT-4o' }));

    // Gone from the active rows...
    expect(screen.queryByText('GPT-4o')).not.toBeInTheDocument();
    // ...but still in the detected pool, so the dropdown offers it again.
    const addButton = screen.getByRole('button', { name: 'Add model' });
    expect(addButton).not.toBeDisabled();
    fireEvent.keyDown(addButton, { key: 'Enter' });
    fireEvent.click(screen.getByText('GPT-4o'));
    expect(screen.getByText('GPT-4o')).toBeInTheDocument();
  });

  it('disables the Add model trigger when every pool model is already active', () => {
    renderEditor(FIXTURES);

    expect(screen.getByRole('button', { name: 'Add model' })).toBeDisabled();
  });

  it('disables the Add model trigger when the pool is empty', () => {
    renderEditor([]);

    expect(screen.getByRole('button', { name: 'Add model' })).toBeDisabled();
  });

  it('custom comma-separated ids join the active list and the pool', () => {
    renderEditor([]);

    const input = screen.getByRole('textbox', { name: 'Model IDs (comma-separated)' });
    fireEvent.change(input, { target: { value: ' custom-1, custom-2 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add models' }));

    expect(screen.getByText('custom-1')).toBeInTheDocument();
    expect(screen.getByText('custom-2')).toBeInTheDocument();

    // Custom entries behave like detected ones: removing keeps them re-addable.
    fireEvent.click(screen.getByRole('button', { name: 'Remove custom-1' }));
    expect(screen.queryByText('custom-1')).not.toBeInTheDocument();
    const addButton = screen.getByRole('button', { name: 'Add model' });
    expect(addButton).not.toBeDisabled();
    fireEvent.keyDown(addButton, { key: 'Enter' });
    fireEvent.click(screen.getByText('custom-1'));
    expect(screen.getByText('custom-1')).toBeInTheDocument();
  });
});

describe('SettingsAIPage delete confirmation', () => {
  beforeEach(() => {
    useAIProvidersMock.mockReset();
    useAppContextMock.mockReset();
  });

  it('shows a confirmation dialog before deleting a profile', () => {
    renderPage([makeProfile()]);

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('Delete provider?')).toBeInTheDocument();
    expect(
      screen.getByText('This will permanently delete the "My OpenRouter" profile and its API key. This action cannot be undone.'),
    ).toBeInTheDocument();
  });

  it('cancel leaves the profile intact', () => {
    const deleteProfile = renderPage([makeProfile()]);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(deleteProfile).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('confirming deletes the profile', () => {
    const deleteProfile = renderPage([makeProfile({ id: 'profile-2' })]);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));

    expect(deleteProfile).toHaveBeenCalledWith('profile-2');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

describe('SettingsAIPage Shakespeare card states', () => {
  beforeEach(() => {
    useAIProvidersMock.mockReset();
    useAppContextMock.mockReset();
    useCurrentUserMock.mockReset();
    useShakespeareMock.mockReset();
  });

  it('shows skeleton placeholders while both card queries are in flight', () => {
    // A never-settling promise keeps each query pending, so the card shows
    // loading skeletons instead of values or error text.
    renderPage([], {
      loggedIn: true,
      credits: () => new Promise(() => {}),
      models: () => new Promise(() => {}),
    });

    expect(screen.getByText('Balance')).toBeInTheDocument();
    expect(screen.getByText('Models')).toBeInTheDocument();
    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument();
    expect(screen.queryByText('Unavailable')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('shows Unavailable for the balance and a Retry button when the credits query fails', async () => {
    renderPage([], {
      loggedIn: true,
      credits: () => Promise.reject(new Error('relay down')),
      models: () => Promise.resolve({ data: [{ fullId: 'shakespeare/gpt', name: 'GPT' }] }),
    });

    expect(await screen.findByText('Unavailable')).toBeInTheDocument();
    expect(screen.getAllByText('Unavailable')).toHaveLength(1);
    // The model readout still succeeds.
    expect(screen.getByText('GPT')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('shows Unavailable for the models and a Retry button when the models query fails', async () => {
    renderPage([], {
      loggedIn: true,
      credits: () => Promise.resolve({ amount: 5 }),
      models: () => Promise.reject(new Error('relay down')),
    });

    expect(await screen.findByText('Unavailable')).toBeInTheDocument();
    expect(screen.getAllByText('Unavailable')).toHaveLength(1);
    // The balance readout still succeeds.
    expect(screen.getByText('$5.00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('Retry recovers both readouts after both queries fail', async () => {
    // Each query fails its first attempt plus its two retries, then a
    // manual refetch succeeds.
    let creditsCalls = 0;
    let modelsCalls = 0;
    renderPage([], {
      loggedIn: true,
      credits: () => {
        creditsCalls += 1;
        return creditsCalls > 3
          ? Promise.resolve({ amount: 5 })
          : Promise.reject(new Error('relay down'));
      },
      models: () => {
        modelsCalls += 1;
        return modelsCalls > 3
          ? Promise.resolve({ data: [{ fullId: 'shakespeare/gpt', name: 'GPT' }] })
          : Promise.reject(new Error('relay down'));
      },
    });

    await waitFor(() => expect(screen.getAllByText('Unavailable')).toHaveLength(2));
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(screen.queryByText('Unavailable')).not.toBeInTheDocument();
      expect(screen.getByText('$5.00')).toBeInTheDocument();
      expect(screen.getByText('GPT')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    });
  });
});
