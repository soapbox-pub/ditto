import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import type { ReactNode } from 'react';

import { useVerifiedBadgeRefs } from './useVerifiedBadgeRefs';

const OWNER = 'a'.repeat(64);
const ISSUER = 'b'.repeat(64);
const ATTACKER = 'c'.repeat(64);
const OUTBOX_ISSUER = 'd'.repeat(64);

const ids = { pool: '1'.repeat(64), forged: '2'.repeat(64), outbox: '3'.repeat(64), missing: '4'.repeat(64) };

function award(id: string, signer: string, aTag: string): NostrEvent {
  return { id, pubkey: signer, kind: 8, created_at: 1, content: '', tags: [['a', aTag], ['p', OWNER]], sig: 'f'.repeat(128) };
}

const refs = [
  { aTag: `30009:${ISSUER}:gold`, eTag: ids.pool, pubkey: ISSUER },
  { aTag: `30009:${ISSUER}:verified`, eTag: ids.forged, pubkey: ISSUER },
  { aTag: `30009:${OUTBOX_ISSUER}:early`, eTag: ids.outbox, pubkey: OUTBOX_ISSUER },
  { aTag: `30009:${ISSUER}:ghost`, eTag: ids.missing, pubkey: ISSUER },
  { aTag: `30009:${ISSUER}:none`, pubkey: ISSUER },
];

const poolQuery = vi.fn(async (filters: NostrFilter[]): Promise<NostrEvent[]> => {
  if (filters[0].kinds?.includes(10002)) {
    return filters[0].authors?.[0] === OUTBOX_ISSUER
      ? [{ id: '5'.repeat(64), pubkey: OUTBOX_ISSUER, kind: 10002, created_at: 1, content: '', tags: [['r', 'wss://outbox.example']], sig: 'f'.repeat(128) }]
      : [];
  }
  return [
    award(ids.pool, ISSUER, refs[0].aTag),
    award(ids.forged, ATTACKER, refs[1].aTag),
  ];
});
const groupQuery = vi.fn(async (): Promise<NostrEvent[]> => [award(ids.outbox, OUTBOX_ISSUER, refs[2].aTag)]);

vi.mock('@nostrify/react', () => ({
  useNostr: () => ({ nostr: { query: poolQuery, group: () => ({ query: groupQuery }) } }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useVerifiedBadgeRefs', () => {
  it('keeps only badges with a real award from their issuer', async () => {
    const { result } = renderHook(() => useVerifiedBadgeRefs(OWNER, refs), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.refs.map((r) => r.eTag)).toEqual([ids.pool, ids.outbox]);
  });
});
