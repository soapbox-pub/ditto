import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import type { ReactNode } from 'react';

import { usePendingBadges } from './usePendingBadges';

const query = vi.fn<(filters: NostrFilter[]) => Promise<NostrEvent[]>>();
vi.mock('@nostrify/react', () => ({
  useNostr: () => ({ nostr: { query } }),
}));

const USER = 'a'.repeat(64);
const ISSUER = 'b'.repeat(64);
const ATTACKER = 'c'.repeat(64);

function makeAward(signer: string, id: string): NostrEvent {
  return {
    id,
    pubkey: signer,
    kind: 8,
    created_at: 1000,
    content: '',
    tags: [['a', `30009:${ISSUER}:verified`], ['p', USER]],
    sig: 'd'.repeat(128),
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('usePendingBadges', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('lists an award signed by the badge issuer', async () => {
    query.mockImplementation(async (filters) =>
      filters.some((f) => f.kinds?.includes(8)) ? [makeAward(ISSUER, '1'.repeat(64))] : [],
    );

    const { result } = renderHook(() => usePendingBadges(USER), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.pendingBadges.map((b) => b.issuerPubkey)).toEqual([ISSUER]);
  });

  it('drops an award for someone else\'s badge', async () => {
    query.mockImplementation(async (filters) =>
      filters.some((f) => f.kinds?.includes(8)) ? [makeAward(ATTACKER, '2'.repeat(64))] : [],
    );

    const { result } = renderHook(() => usePendingBadges(USER), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.pendingBadges).toEqual([]);
  });
});
