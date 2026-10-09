import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { QuickReactionsChangedError, usePublishQuickReactions, useQuickReactionList } from '@/hooks/useQuickReactionList';

import type { NostrEvent } from '@nostrify/nostrify';
import type { ReactNode } from 'react';

const SELF = 'a'.repeat(64);

const h = vi.hoisted(() => ({
  fresh: vi.fn<() => Promise<NostrEvent | null>>(),
  publish: vi.fn<(t: Record<string, unknown>) => Promise<unknown>>(),
}));

vi.mock('@nostrify/react', () => ({ useNostr: () => ({ nostr: {} }) }));
vi.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ user: { pubkey: SELF } }) }));
vi.mock('@/hooks/useNostrStorage', () => ({ useNostrStorage: () => ({ store: { query: async () => [] } }) }));
vi.mock('@/hooks/useCacheFirstSeed', () => ({ useCacheFirstSeed: () => {} }));
vi.mock('@/hooks/useNostrPublish', () => ({ useNostrPublish: () => ({ mutateAsync: h.publish }) }));
vi.mock('@/lib/fetchFreshEvent', () => ({ fetchFreshEvent: () => h.fresh() }));

let n = 0;
function list(tags: string[][], created_at = 1000): NostrEvent {
  return { id: `list${++n}`.padEnd(64, '0'), pubkey: SELF, created_at, kind: 10077, tags, content: '', sig: 'f'.repeat(128) };
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function render() {
  return renderHook(() => ({ list: useQuickReactionList(), publish: usePublishQuickReactions() }), { wrapper });
}

beforeEach(() => {
  h.fresh.mockReset();
  h.publish.mockReset().mockImplementation(async (t) => ({ ...t, id: `pub${++n}`.padEnd(64, '0'), pubkey: SELF, sig: '' }));
});

describe('usePublishQuickReactions', () => {
  it('replaces the reactions and keeps the list\'s other tags', async () => {
    const prev = list([['reaction', '🔥'], ['x-other', 'kept']]);
    h.fresh.mockResolvedValue(prev);
    const view = render();
    await waitFor(() => expect(view.result.current.list).toEqual(prev));

    await act(() => view.result.current.publish.mutateAsync({ reactions: [{ emoji: '🙏' }, { emoji: '🔥' }], basis: prev.id }));

    expect(h.publish).toHaveBeenCalledWith(expect.objectContaining({
      kind: 10077,
      tags: [['x-other', 'kept'], ['reaction', '🙏'], ['reaction', '🔥'], ['alt', expect.any(String)]],
      created_at: expect.any(Number),
    }));
  });

  it('refuses when the relays hold a newer list than the one the user edited', async () => {
    const shown = list([['reaction', '🔥']], 1000);
    const newer = list([['reaction', '🐸']], 2000);
    h.fresh.mockResolvedValueOnce(shown).mockResolvedValue(newer);
    const view = render();
    await waitFor(() => expect(view.result.current.list).toEqual(shown));

    await expect(view.result.current.publish.mutateAsync({ reactions: [{ emoji: '🙏' }], basis: shown.id }))
      .rejects.toBeInstanceOf(QuickReactionsChangedError);
    expect(h.publish).not.toHaveBeenCalled();
    await waitFor(() => expect(view.result.current.list).toEqual(newer));
  });

  it('rolls the row back when the publish fails', async () => {
    const prev = list([['reaction', '🔥']]);
    h.fresh.mockResolvedValue(prev);
    h.publish.mockRejectedValue(new Error('no relays'));
    const view = render();
    await waitFor(() => expect(view.result.current.list).toEqual(prev));

    await act(async () => {
      await view.result.current.publish.mutateAsync({ reactions: [{ emoji: '🙏' }], basis: prev.id }).catch(() => {});
    });
    expect(view.result.current.list).toEqual(prev);
  });

  it('creates the first list when there is none', async () => {
    h.fresh.mockResolvedValue(null);
    const view = render();
    await waitFor(() => expect(view.result.current.list).toBeNull());

    await act(() => view.result.current.publish.mutateAsync({ reactions: [{ emoji: '🙏' }], basis: null }));
    expect(h.publish).toHaveBeenCalledWith(expect.objectContaining({ tags: [['reaction', '🙏'], ['alt', expect.any(String)]], content: '' }));
  });
});
