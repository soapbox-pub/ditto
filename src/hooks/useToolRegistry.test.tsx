import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useToolRegistry } from './useToolRegistry';
import type { ChatSession } from './useChatSessions';

const { applyCustomTheme, query } = vi.hoisted(() => ({
  applyCustomTheme: vi.fn(),
  query: vi.fn(async () => []),
}));

vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ applyCustomTheme }),
}));

vi.mock('@nostrify/react', () => ({
  useNostr: () => ({ nostr: { query } }),
}));

const BASE_NAMES = ['set_theme', 'fetch_nip', 'ask_questions'];

function makeSession(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    id: 'sess-1',
    title: '',
    abilities: [],
    providerId: 'shakespeare',
    modelId: 'shakespeare/model',
    createdAt: new Date(),
    ...overrides,
  };
}

describe('useToolRegistry', () => {
  it('builds the base bundle with set_theme bound to the live applyCustomTheme', async () => {
    const { result } = renderHook(() => useToolRegistry());

    const base = result.current.baseTools;
    expect(base.map((b) => b.name)).toEqual(BASE_NAMES);

    await base[0].tool.execute({
      background: '0 0% 100%',
      text: '0 0% 10%',
      primary: '142 70% 45%',
    });

    expect(applyCustomTheme).toHaveBeenCalled();
  });

  it('does not put nak in the base bundle: it only appears in a nostr-lookup session, bound to the live nostr client', async () => {
    const { result } = renderHook(() => useToolRegistry());

    expect(result.current.baseTools.map((b) => b.name)).not.toContain('nak');

    const tools = result.current.buildSessionTools(makeSession({ abilities: ['nostr-lookup'] }));
    const nak = tools.find((b) => b.name === 'nak')!;
    expect(nak).toBeDefined();
    await nak.tool.execute({ action: 'req', kinds: [1] });

    expect(query).toHaveBeenCalled();
  });

  it('does not put search_nips in the base bundle: it only appears in a nostr-lookup session', () => {
    const { result } = renderHook(() => useToolRegistry());

    expect(result.current.baseTools.map((b) => b.name)).not.toContain('search_nips');

    const tools = result.current.buildSessionTools(makeSession({ abilities: ['nostr-lookup'] }));
    expect(tools.map((b) => b.name)).toContain('search_nips');
  });

  it('keeps only the base bundle for a session with no abilities', () => {
    const { result } = renderHook(() => useToolRegistry());

    const tools = result.current.buildSessionTools(makeSession());
    expect(tools.map((b) => b.name)).toEqual(BASE_NAMES);
  });
});
