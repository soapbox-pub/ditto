import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useToolRegistry } from './useToolRegistry';
import type { ChatSession } from './useChatSessions';

const { applyCustomTheme } = vi.hoisted(() => ({ applyCustomTheme: vi.fn() }));

vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ applyCustomTheme }),
}));

const BASE_NAMES = ['set_theme', 'search_nips', 'fetch_nip'];

const TILES_NAMES = [
  'read_code',
  'write_code',
  'edit_code',
  'set_tile',
  'get_tile',
  'preview_tile',
  'ask_questions',
  'set_notes',
  'read_spec',
  'read_examples',
];

function makeSession(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    id: 'sess-1',
    abilities: [],
    providerId: 'shakespeare',
    modelId: 'shakespeare/model',
    messages: [],
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

  it('keeps only the base bundle for a session with no abilities', () => {
    const { result } = renderHook(() => useToolRegistry());

    const tools = result.current.buildSessionTools(makeSession());
    expect(tools.map((b) => b.name)).toEqual(BASE_NAMES);
  });

  it('adds the tiles bundle for a tiles session, base first', () => {
    const { result } = renderHook(() => useToolRegistry());

    const tools = result.current.buildSessionTools(makeSession({ abilities: ['tiles'] }));
    expect(tools.map((b) => b.name)).toEqual([...BASE_NAMES, ...TILES_NAMES]);
  });
});
