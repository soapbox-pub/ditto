import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import type { ReactNode } from 'react';

import { useEventInteractions } from './useEventInteractions';

const query = vi.fn<() => Promise<NostrEvent[]>>();
vi.mock('@nostrify/react', () => ({
  useNostr: () => ({ nostr: { query } }),
}));

const AUTHOR = 'a'.repeat(64);
const PROVIDER = 'b'.repeat(64);
const ATTACKER = 'c'.repeat(64);
const SENDER = 'd'.repeat(64);
const POST = 'e'.repeat(64);

// The author's lightning provider is PROVIDER; anything else is forged.
vi.mock('@/hooks/useZapReceiptCheck', () => ({
  useZapReceiptCheck: (pubkey: string | undefined) => ({
    checkZap: (event: NostrEvent) => (pubkey && event.pubkey !== PROVIDER ? 'forged' : 'genuine'),
    key: 'test',
  }),
}));

/** 2500u = 250,000 sats (from src/lib/bolt11.test.ts). */
const INVOICE =
  'lnbc2500u1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypq' +
  'dq5xysxxatsyp3k7enxv4jsxqzpuaztrnwngzn3kdzw5hydlzf03qdgm2hdq27cqv3agm2aw' +
  'hz5se903vruatfhq77w3ls4evs3ch9zw97j25emudupq63nyw24cg27h2rspfj9srp';

function receipt(id: string, signer: string, recipient: string): NostrEvent {
  return {
    id,
    pubkey: signer,
    kind: 9735,
    created_at: 1000,
    content: '',
    tags: [['e', POST], ['p', recipient], ['P', SENDER], ['bolt11', INVOICE]],
    sig: 'f'.repeat(128),
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useEventInteractions zaps', () => {
  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue([
      receipt('1'.repeat(64), PROVIDER, AUTHOR),
      receipt('2'.repeat(64), ATTACKER, AUTHOR),
      receipt('3'.repeat(64), PROVIDER, ATTACKER),
    ]);
  });

  it('keeps only receipts paid to the author by their provider', async () => {
    const { result } = renderHook(() => useEventInteractions(POST, AUTHOR), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.zaps.map((z) => z.eventId)).toEqual(['1'.repeat(64)]);
  });

  it('returns no zaps when no author is given', async () => {
    const { result } = renderHook(() => useEventInteractions(POST, undefined), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.zaps).toEqual([]);
  });
});
