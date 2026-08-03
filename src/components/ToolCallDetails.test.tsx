import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';

import type { ToolCall } from '@/hooks/useChatSessions';
import { ToolCallDetails } from './ToolCallDetails';

/**
 * Render one tool call's details. The component needs only react-intl, so the
 * provider settles synchronously. The first assertion per test still uses
 * findBy* so the tests survive a provider swap.
 */
function renderDetails(toolCall: ToolCall) {
  return render(
    <IntlProvider locale="en" onError={() => {}}>
      <ToolCallDetails toolCall={toolCall} />
    </IntlProvider>,
  );
}

/**
 * The expand/collapse trigger. Contract: its accessible name contains "Show"
 * (for example "Show more" or "Show details").
 */
function expandTrigger(): HTMLElement {
  return screen.getByRole('button', { name: /show/i });
}

describe('ToolCallDetails', () => {
  it('summarizes a successful set_theme call with the applied font', async () => {
    const toolCall: ToolCall = {
      id: '1',
      name: 'set_theme',
      arguments: { background: '228 20% 10%', text: '210 40% 98%', primary: '258 70% 60%', font: 'Inter' },
      result: JSON.stringify({
        success: true,
        colors: { background: '228 20% 10%', text: '210 40% 98%', primary: '258 70% 60%' },
        font: 'Inter',
      }),
    };
    renderDetails(toolCall);

    expect((await screen.findAllByText(/theme applied/i)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Inter/).length).toBeGreaterThan(0);
  });

  it('shows the error text for a failed set_theme call', async () => {
    const toolCall: ToolCall = {
      id: '1',
      name: 'set_theme',
      arguments: { background: '228 20% 10%', text: '210 40% 98%', primary: '258 70% 60%', font: 'Inter' },
      result: JSON.stringify({ error: 'Invalid HSL color values...' }),
    };
    renderDetails(toolCall);

    expect(await screen.findByText(/invalid hsl/i)).toBeInTheDocument();
  });

  it('renders answered ask_questions as read-only text', async () => {
    const toolCall: ToolCall = {
      id: '2',
      name: 'ask_questions',
      arguments: {
        questions: [
          { text: 'What color scheme?', suggestions: ['Dark', 'Light'] },
          { text: 'Any font preference?' },
        ],
      },
      result: 'Q1: What color scheme?\nA1: Dark\n\nQ2: Any font preference?\nA2: Something playful',
    };
    renderDetails(toolCall);

    expect(await screen.findByText(/what color scheme/i)).toBeInTheDocument();
    expect(screen.getByText(/any font preference/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Dark/).length).toBeGreaterThan(0);
    expect(screen.getByText(/something playful/i)).toBeInTheDocument();

    // Historical answers are plain text, never interactive controls.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('renders something readable when an ask_questions result is malformed', () => {
    const toolCall: ToolCall = {
      id: '2',
      name: 'ask_questions',
      arguments: { questions: [{ text: 'What color scheme?', suggestions: ['Dark', 'Light'] }] },
      result: 'garbage',
    };
    const { container } = renderDetails(toolCall);

    // The fallback must not throw, and it must render some content. The tool
    // name, the raw result, or the questions from the arguments all qualify.
    expect(container.textContent?.trim().length).toBeGreaterThan(0);
  });

  it('shows a nak req summary and reveals the raw result behind a trigger', async () => {
    const toolCall: ToolCall = {
      id: '3',
      name: 'nak',
      arguments: { action: 'req', kinds: [1], limit: 5 },
      result: 'Found 3 event(s):\n\n## Event 1\nid: abc...',
    };
    renderDetails(toolCall);

    // The one-line summary is visible without expanding.
    expect(await screen.findByText(/3 event/i)).toBeInTheDocument();

    // The full raw result stays hidden until the trigger is clicked.
    expect(screen.queryByText(/Event 1/)).not.toBeInTheDocument();

    fireEvent.click(expandTrigger());

    expect(screen.getByText(/Event 1/)).toBeInTheDocument();
  });

  it('shows a nak error in the summary without expanding', async () => {
    const toolCall: ToolCall = {
      id: '4',
      name: 'nak',
      arguments: { action: 'req' },
      result: JSON.stringify({ error: 'The "kinds" field is required for the req action.' }),
    };
    renderDetails(toolCall);

    expect(await screen.findByText(/required for the req action/i)).toBeInTheDocument();
  });

  it('shows the bare encoded string for a successful nak encode', async () => {
    const toolCall: ToolCall = {
      id: '5',
      name: 'nak',
      arguments: { action: 'encode', type: 'npub', pubkey: '0'.repeat(64) },
      result: 'npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq',
    };
    renderDetails(toolCall);

    // nak encode returns a bare string on success, never JSON. The string
    // itself must be visible directly, without expanding anything.
    expect(
      await screen.findByText(/npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq/),
    ).toBeInTheDocument();
  });

  it('renders unhandled tool results as pretty JSON behind a trigger, collapsed by default', async () => {
    const toolCall: ToolCall = {
      id: '7',
      name: 'set_tile',
      arguments: { code: 'print("hi")' },
      result: JSON.stringify({ success: true, lines: 1 }),
    };
    const { container } = renderDetails(toolCall);

    const trigger = await screen.findByRole('button', { name: /show/i });

    // The JSON payload is hidden until the trigger is clicked.
    expect(screen.queryByText(/"success"/)).not.toBeInTheDocument();

    fireEvent.click(trigger);

    const pre = container.querySelector('pre');
    expect(pre).not.toBeNull();
    expect(pre?.textContent).toMatch(/"success"\s*:\s*true/);
  });

  it.each<[string, Record<string, unknown>, string]>([
    ['fetch_nip', { nip: '18' }, '## NIP-18\n\nReposts and quote posts.'],
    ['search_nips', { query: 'zap' }, '## Search results\n\nFound **zap** related NIPs.'],
  ])(
    'renders %s results through the markdown pipeline, not the JSON fallback',
    async (name, args, result) => {
      const toolCall: ToolCall = { id: '8', name, arguments: args, result };
      const { container } = renderDetails(toolCall);

      const trigger = await screen.findByRole('button', { name: /show/i });
      if (!container.querySelector('h1, h2, h3, h4, h5, h6')) {
        fireEvent.click(trigger);
      }

      // A heading element proves markdown ran. The JSON fallback would show a
      // quoted string instead.
      expect(container.querySelector('h1, h2, h3, h4, h5, h6')).not.toBeNull();
      expect(container.textContent).not.toContain('##');
    },
  );
});
