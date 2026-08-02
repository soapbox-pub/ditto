import { describe, it, expect } from 'vitest';
import type { SessionMessage } from '@soapbox.pub/nostr-canvas/devkit';

import { isFirstExchangeComplete, buildTitlePrompt, pickAutoTitleModel, AUTO_TITLE_MODEL_ID } from './autoTitle';
import type { Model } from '@/hooks/useShakespeare';

// ─── Fixtures ───────────────────────────────────────────────────────────────

function model(overrides: Partial<Model>): Model {
  return {
    id: 'm',
    name: 'M',
    description: '',
    object: 'model',
    owned_by: 'shakespeare',
    created: 0,
    context_window: 1000,
    pricing: { prompt: '1', completion: '2' },
    provider: 'shakespeare',
    fullId: 'shakespeare/m',
    ...overrides,
  };
}

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

describe('pickAutoTitleModel', () => {
  it('prefers the fixed cheap model when the live list has it', () => {
    const models = [
      model({ id: 'glm-4.5', fullId: 'shakespeare/glm-4.5', name: 'GLM-4.5', pricing: { prompt: '1.5', completion: '7.5' } }),
      model({ id: 'claude-sonnet-4.5', fullId: 'shakespeare/claude-sonnet-4.5', name: 'Claude Sonnet 4.5', pricing: { prompt: '4', completion: '16' } }),
    ];
    expect(pickAutoTitleModel(models)?.id).toBe(AUTO_TITLE_MODEL_ID);
  });

  it('falls back to the cheapest model when the fixed id is absent', () => {
    const models = [
      model({ id: 'expensive', fullId: 'shakespeare/expensive', pricing: { prompt: '8', completion: '24' } }),
      model({ id: 'cheap', fullId: 'shakespeare/cheap', pricing: { prompt: '0.5', completion: '1' } }),
    ];
    expect(pickAutoTitleModel(models)?.id).toBe('cheap');
  });

  it('returns undefined for an empty list', () => {
    expect(pickAutoTitleModel([])).toBeUndefined();
  });
});
