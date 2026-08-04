import { describe, it, expect } from 'vitest';
import type { SessionMessage } from '@soapbox.pub/nostr-canvas/devkit';

import { isFirstExchangeComplete, buildTitlePrompt } from './autoTitle';

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('isFirstExchangeComplete', () => {
  it('is false for an empty or single-user-message thread', () => {
    expect(isFirstExchangeComplete([])).toBe(false);
    expect(isFirstExchangeComplete([{ role: 'user', content: 'hi' }])).toBe(false);
  });

  it('is false for assistant-only messages', () => {
    expect(isFirstExchangeComplete([{ role: 'assistant', content: 'hi' }])).toBe(false);
  });

  it('is true once a user message and an assistant reply both exist', () => {
    const messages: SessionMessage[] = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ];
    expect(isFirstExchangeComplete(messages)).toBe(true);
  });

  it('ignores tool-call-only assistant messages and compaction markers', () => {
    const messages: SessionMessage[] = [
      { role: 'user', content: 'build me a tile' },
      { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'ask_questions', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'c1', content: 'ok' },
      { role: 'compaction_marker', content: 'compacted' },
      { role: 'assistant', content: 'done' },
    ];
    expect(isFirstExchangeComplete(messages)).toBe(true);
  });

  it('is false when the assistant only made tool calls and never replied with content', () => {
    const messages: SessionMessage[] = [
      { role: 'user', content: 'go' },
      { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'ask_questions', arguments: '{}' } }] },
    ];
    expect(isFirstExchangeComplete(messages)).toBe(false);
  });
});

describe('buildTitlePrompt', () => {
  it('contains the user and assistant turns', () => {
    const messages: SessionMessage[] = [
      { role: 'user', content: 'make a tile' },
      { role: 'assistant', content: 'what color?' },
    ];
    const prompt = buildTitlePrompt(messages);
    expect(prompt).toContain('user: make a tile');
    expect(prompt).toContain('assistant: what color?');
    expect(prompt).toMatch(/title/i);
  });

  it('skips tool messages and truncates very long content', () => {
    const long = 'x'.repeat(500);
    const messages: SessionMessage[] = [
      { role: 'user', content: long },
      { role: 'tool', tool_call_id: 'c1', content: 'result' },
    ];
    const prompt = buildTitlePrompt(messages);
    expect(prompt).not.toContain('tool:');
    expect(prompt).not.toContain(long);
    expect(prompt).toContain(long.slice(0, 300));
  });
});
