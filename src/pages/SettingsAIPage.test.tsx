import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { IntlProvider } from 'react-intl';

import { ModelListEditor } from './SettingsAIPage';
import type { AIProviderProfile } from '@/hooks/useAIProviders';

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

// Minimal wrapper: ModelListEditor only needs react-intl (all strings have
// inline English defaultMessages) and the module-level toast store, so the
// full TestApp/Nostr stack is unnecessary here.
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
