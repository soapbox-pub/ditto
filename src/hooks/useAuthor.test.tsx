import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import type { ReactNode } from 'react';

import { useAuthor } from './useAuthor';
import type { ProfileCacheEntry } from '@/lib/profileCache';

// Control the relay response per-test.
const query = vi.fn<(...args: unknown[]) => Promise<NostrEvent[]>>();
vi.mock('@nostrify/react', () => ({
  useNostr: () => ({ nostr: { query } }),
}));

// Control the IndexedDB-backed cache per-test.
const getProfileCached = vi.fn<(pubkey: string) => ProfileCacheEntry | undefined>();
const setProfileCached = vi.fn<() => Promise<void>>(() => Promise.resolve());
vi.mock('@/lib/profileCache', () => ({
  getProfileCached: (pubkey: string) => getProfileCached(pubkey),
  setProfileCached: () => setProfileCached(),
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
    getProfileCached.mockReset();
    setProfileCached.mockClear();
  });

  it('retains the cached profile when the relay returns no event', async () => {
    // A profile we already have cached (e.g. seeded from IndexedDB on a prior
    // visit). Age it past staleTime (5 min) but within MAX_CACHE_AGE (7 d) so
    // it seeds initialData AND triggers a background refetch on mount.
    const cachedEvent = makeKind0('Alice');
    const cachedEntry: ProfileCacheEntry = {
      pubkey: PUBKEY,
      event: cachedEvent,
      metadata: { name: 'Alice' },
      lastFetched: Date.now() - 10 * 60 * 1000,
    };
    getProfileCached.mockReturnValue(cachedEntry);

    // The relay fails to return the kind 0 (transient miss).
    query.mockResolvedValue([]);

    const { result } = renderHook(() => useAuthor(PUBKEY), { wrapper });

    // Seeded from initialData immediately.
    expect(result.current.data?.metadata?.name).toBe('Alice');

    // Wait for the background refetch to settle, then assert the profile did
    // NOT get blanked out by the empty relay response.
    await waitFor(() => expect(result.current.isFetching).toBe(false));

    expect(query).toHaveBeenCalled();
    expect(result.current.data?.event).toEqual(cachedEvent);
    expect(result.current.data?.metadata?.name).toBe('Alice');
  });

  it('returns an empty result when the relay misses and nothing is cached', async () => {
    getProfileCached.mockReturnValue(undefined);
    query.mockResolvedValue([]);

    const { result } = renderHook(() => useAuthor(PUBKEY), { wrapper });

    await waitFor(() => expect(result.current.isFetching).toBe(false));

    expect(result.current.data).toEqual({});
  });
});
