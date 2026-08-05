import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
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

/** Renders the page with a mocked provider store; returns the delete spy. */
function renderPage(profiles: AIProviderProfile[]) {
  const deleteProfile = vi.fn();
  useAppContextMock.mockReturnValue({ config: { appName: 'Ditto' } });
  useAIProvidersMock.mockReturnValue({
    profiles,
    addProfile: vi.fn(),
    updateProfile: vi.fn(),
    deleteProfile,
    duplicateProfile: vi.fn(),
    isLoading: false,
    hasNip44Support: true,
  });
  // Logged out by default: the Shakespeare card then skips both of its
  // queries, so these tests stay focused on the custom-provider list.
  useCurrentUserMock.mockReturnValue({ user: undefined });
  useShakespeareMock.mockReturnValue({
    getCreditsBalance: vi.fn(),
    getAvailableModels: vi.fn(),
  });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
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
