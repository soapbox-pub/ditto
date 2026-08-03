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
function renderDetails(toolCall: ToolCall, previousCode?: string) {
  return render(
    <IntlProvider locale="en" onError={() => {}}>
      <ToolCallDetails toolCall={toolCall} previousCode={previousCode} />
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

  it('renders read_spec results through markdown', async () => {
    const toolCall: ToolCall = {
      id: '6',
      name: 'read_spec',
      arguments: { section: '7' },
      result: '## TIP-07\n\nSome Title\n\n*Status: mandatory*\n\nSome body text with **bold**.',
    };
    const { container } = renderDetails(toolCall);

    // A trigger is always present. Short content may or may not start expanded.
    const trigger = await screen.findByRole('button', { name: /show/i });
    if (!screen.queryByRole('heading', { name: /TIP-07/ })) {
      fireEvent.click(trigger);
    }

    // Markdown is processed: headings and emphasis become real elements.
    expect(screen.getByRole('heading', { name: /TIP-07/ })).toBeInTheDocument();
    expect(container.querySelector('strong, b')).toHaveTextContent('bold');
    expect(container.textContent).not.toContain('**bold**');
  });

  it('keeps long read_spec results collapsed until expanded', async () => {
    const longResult = '## TIP-07\n\n' + 'Some body text. '.repeat(100);
    const toolCall: ToolCall = {
      id: '6',
      name: 'read_spec',
      arguments: { section: '7' },
      result: longResult,
    };
    renderDetails(toolCall);

    const trigger = await screen.findByRole('button', { name: /show/i });
    expect(screen.queryByText(/some body text/i)).not.toBeInTheDocument();

    fireEvent.click(trigger);

    expect(screen.getByText(/some body text/i)).toBeInTheDocument();
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

  it('shows the read_code range summary and hides the code body behind a trigger', async () => {
    const toolCall: ToolCall = {
      id: '9',
      name: 'read_code',
      arguments: { offset: 12, limit: 34 },
      result: '[lines 12–45 of 80]\n12:ab3| local x = 1\n13:c9f| local y = 2',
    };
    renderDetails(toolCall);

    // The range note is the summary: visible without expanding.
    expect(await screen.findByText(/lines 12[–-]45 of 80/i)).toBeInTheDocument();

    // The hashline-tagged code body stays hidden until the trigger is clicked.
    expect(screen.queryByText(/local x = 1/)).not.toBeInTheDocument();

    fireEvent.click(expandTrigger());

    expect(screen.getByText(/local x = 1/)).toBeInTheDocument();
    expect(screen.getByText(/local y = 2/)).toBeInTheDocument();
  });

  it('renders the empty-file message for an empty read_code result', async () => {
    const toolCall: ToolCall = {
      id: '10',
      name: 'read_code',
      arguments: { offset: 1, limit: 10 },
      result: '(empty file — no code yet)',
    };
    renderDetails(toolCall);

    // The message renders directly. No expand affordance is required, and an
    // empty collapsible must not break the render.
    expect(await screen.findByText(/no code yet/i)).toBeInTheDocument();
  });

  it('shows the new code for a first write when no previousCode exists', async () => {
    const toolCall: ToolCall = {
      id: '11',
      name: 'write_code',
      arguments: { code: 'local function foo()\n  return 1\nend' },
      result: 'File written (3 lines).\n<!--CODE_VERSION:0-->',
    };
    renderDetails(toolCall);

    expect(await screen.findByText(/File written \(3 lines\)/i)).toBeInTheDocument();

    // Nothing to diff against, so the code body sits behind the trigger.
    expect(screen.queryByText(/local function foo/)).not.toBeInTheDocument();

    fireEvent.click(expandTrigger());

    expect(screen.getAllByText(/local function foo/).length).toBeGreaterThan(0);
  });

  it('shows a diff against previousCode for write_code when provided', async () => {
    const toolCall: ToolCall = {
      id: '12',
      name: 'write_code',
      arguments: { code: 'local function foo()\n  return 1\nend' },
      result: 'File written (3 lines).\n<!--CODE_VERSION:0-->',
    };
    renderDetails(toolCall, 'local function foo()\n  return 0\nend');

    expect(await screen.findByText(/File written \(3 lines\)/i)).toBeInTheDocument();

    // The diff stays hidden until the trigger is clicked.
    expect(screen.queryByText(/return 0/)).not.toBeInTheDocument();
    expect(screen.queryByText(/return 1/)).not.toBeInTheDocument();

    fireEvent.click(expandTrigger());

    // Both the removed line and the added line appear in the diff.
    expect(screen.getAllByText(/return 0/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/return 1/).length).toBeGreaterThan(0);
    // Unchanged lines appear at least once.
    expect(screen.getAllByText(/local function foo/).length).toBeGreaterThan(0);
  });

  it('shows an edit_code summary and hides the operations behind a trigger', async () => {
    const toolCall: ToolCall = {
      id: '13',
      name: 'edit_code',
      arguments: {
        operations: [
          { op: 'replace_line', hash: '12:ab3', content: 'local x = 2' },
          { op: 'delete_line', hash: '13:c9f' },
        ],
      },
      result: 'Applied 2 operation(s). File now has 79 lines.\n<!--CODE_VERSION:1-->',
    };
    const { container } = renderDetails(toolCall);

    // The operation count is the summary: visible without expanding.
    expect(await screen.findByText(/2 operation/i)).toBeInTheDocument();

    // The per-operation details stay hidden until the trigger is clicked.
    const opProbe = /replace_line|delete_line|13:c9f|local x = 2/i;
    expect(screen.queryByText(opProbe)).not.toBeInTheDocument();

    fireEvent.click(expandTrigger());

    expect(container.textContent).toMatch(opProbe);
  });

  it('shows an edit_code hash-not-found error without expanding', async () => {
    const toolCall: ToolCall = {
      id: '14',
      name: 'edit_code',
      arguments: { operations: [{ op: 'delete_line', hash: '99:zzz' }] },
      result: 'Error: hash 99:zzz not found in current code',
    };
    renderDetails(toolCall);

    expect(await screen.findByText(/not found in current code/i)).toBeInTheDocument();
  });
});
