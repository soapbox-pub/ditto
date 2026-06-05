import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import type { ReactNode } from 'react';

import { useAuthor } from './useAuthor';

// Control the relay response per-test.
const query = vi.fn<(...args: unknown[]) => Promise<NostrEvent[]>>();
vi.mock('@nostrify/react', () => ({
  useNostr: () => ({ nostr: { query } }),
}));

// Control the IndexedDB-backed event store per-test.
const storeQuery = vi.fn<(...args: unknown[]) => Promise<NostrEvent[]>>(() => Promise.resolve([]));
const storeEvent = vi.fn<() => Promise<void>>(() => Promise.resolve());
vi.mock('@/hooks/useEventStore', () => ({
  useEventStore: () => Promise.resolve({ query: storeQuery, event: storeEvent }),
}));

const PUBKEY = 'a'.repeat(64);

function makeKind0(name: string, createdAt = 1000): NostrEvent {
  return {
    id: 'b'.repeat(64),
    pubkey: PUBKEY,
    kind: 0,
    created_at: createdAt,
    content: JSON.stringify({ name }),
    tags: [],
    sig: 'c'.repeat(128),
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useAuthor relay-miss handling', () => {
  beforeEach(() => {
    query.mockReset();
    storeQuery.mockReset();
    storeQuery.mockResolvedValue([]);
    storeEvent.mockClear();
  });

  it('falls back to the cached profile when the relay returns no event', async () => {
    const cachedEvent = makeKind0('Alice');

    // The relay fails to return the kind 0 (transient miss)...
    query.mockResolvedValue([]);
    // ...but the local event store still has it.
    storeQuery.mockResolvedValue([cachedEvent]);

    const { result } = renderHook(() => useAuthor(PUBKEY), { wrapper });

    await waitFor(() => expect(result.current.isFetching).toBe(false));

    expect(query).toHaveBeenCalled();
    expect(result.current.data?.event).toEqual(cachedEvent);
    expect(result.current.data?.metadata?.name).toBe('Alice');
  });

  it('returns an empty result when the relay misses and nothing is cached', async () => {
    query.mockResolvedValue([]);
    storeQuery.mockResolvedValue([]);

    const { result } = renderHook(() => useAuthor(PUBKEY), { wrapper });

    await waitFor(() => expect(result.current.isFetching).toBe(false));

    expect(result.current.data).toEqual({});
  });

  it('persists a fetched profile to the event store', async () => {
    const event = makeKind0('Bob');
    query.mockResolvedValue([event]);

    const { result } = renderHook(() => useAuthor(PUBKEY), { wrapper });

    await waitFor(() => expect(result.current.data?.metadata?.name).toBe('Bob'));

    expect(storeEvent).toHaveBeenCalledWith(event);
  });
});
