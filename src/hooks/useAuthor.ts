import { type NostrEvent, type NostrMetadata, NSchema as n } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Module-level batcher: collects pubkeys requested in the same JS tick,
 * fires ONE relay query for all of them, then seeds each ['author', pubkey]
 * cache entry. This means 20 NoteCards mounting simultaneously share a
 * single round trip instead of firing 20 individual queries.
 */

type Nostr = ReturnType<typeof useNostr>['nostr'];
type QueryClient = ReturnType<typeof useQueryClient>;

interface PendingEntry {
  resolve: (data: { event?: NostrEvent; metadata?: NostrMetadata }) => void;
}

const pendingByPubkey = new Map<string, PendingEntry[]>();
let flushScheduled = false;
let nostrInstance: Nostr | null = null;
let queryClientInstance: QueryClient | null = null;

function scheduleBatchFlush(nostr: Nostr, qc: QueryClient) {
  nostrInstance = nostr;
  queryClientInstance = qc;
  if (flushScheduled) return;
  flushScheduled = true;
  // Flush after all synchronous React render work for this tick completes
  Promise.resolve().then(flushBatch);
}

async function flushBatch() {
  flushScheduled = false;
  if (pendingByPubkey.size === 0) return;

  // Snapshot pending, clear immediately so new requests in the same flush don't get lost
  const batch = new Map(pendingByPubkey);
  pendingByPubkey.clear();

  const pubkeys = [...batch.keys()];
  const nostr = nostrInstance;
  const qc = queryClientInstance;

  if (!nostr || !qc) {
    for (const [, entries] of batch) {
      for (const e of entries) e.resolve({});
    }
    return;
  }

  let profileEvents: NostrEvent[] = [];
  try {
    profileEvents = await nostr.query(
      [{ kinds: [0], authors: pubkeys, limit: pubkeys.length }],
      { signal: AbortSignal.timeout(5000) },
    );
  } catch {
    // Relay unavailable — callers will show generated names
  }

  // Build result map and seed the TanStack Query cache
  const results = new Map<string, { event?: NostrEvent; metadata?: NostrMetadata }>();
  for (const ev of profileEvents) {
    let metadata: NostrMetadata | undefined;
    try { metadata = n.json().pipe(n.metadata()).parse(ev.content); } catch { /* skip */ }
    const data = { event: ev, metadata };
    results.set(ev.pubkey, data);
    qc.setQueryData(['author', ev.pubkey], data);
  }

  // Resolve each waiting promise
  for (const [pubkey, entries] of batch) {
    const data = results.get(pubkey) ?? {};
    for (const e of entries) e.resolve(data);
  }
}

export function useAuthor(pubkey: string | undefined) {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();

  return useQuery<{ event?: NostrEvent; metadata?: NostrMetadata }>({
    queryKey: ['author', pubkey ?? ''],
    queryFn: async () => {
      if (!pubkey) return {};

      // If already in cache (seeded by prefetch or previous batch), return it
      const cached = queryClient.getQueryData<{ event?: NostrEvent; metadata?: NostrMetadata }>(['author', pubkey]);
      if (cached !== undefined) return cached;

      // Add to the pending batch. This call and every other useAuthor call
      // in the same JS tick will be coalesced into one relay query.
      return new Promise((resolve) => {
        const entries = pendingByPubkey.get(pubkey) ?? [];
        entries.push({ resolve });
        pendingByPubkey.set(pubkey, entries);
        scheduleBatchFlush(nostr, queryClient);
      });
    },
    staleTime: 5 * 60 * 1000,
    retry: false, // Batcher handles retries implicitly; retrying here causes duplicate requests
  });
}
