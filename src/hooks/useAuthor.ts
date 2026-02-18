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
  Promise.resolve().then(flushBatch);
}

async function flushBatch() {
  flushScheduled = false;
  if (pendingByPubkey.size === 0) return;

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
    // Relay unavailable — resolve with empty so components show fallback names
  }

  const results = new Map<string, { event?: NostrEvent; metadata?: NostrMetadata }>();
  for (const ev of profileEvents) {
    let metadata: NostrMetadata | undefined;
    try { metadata = n.json().pipe(n.metadata()).parse(ev.content); } catch { /* skip */ }
    results.set(ev.pubkey, { event: ev, metadata });
  }

  for (const [pubkey, entries] of batch) {
    const data = results.get(pubkey) ?? {};
    for (const e of entries) e.resolve(data);
    // Seed cache as fresh so TanStack Query won't immediately refetch.
    // Only seed if we got real data — don't overwrite good data with {}.
    if (results.has(pubkey)) {
      qc.setQueryData(['author', pubkey], data, { updatedAt: Date.now() });
    }
  }
}

export function useAuthor(pubkey: string | undefined) {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();

  return useQuery<{ event?: NostrEvent; metadata?: NostrMetadata }>({
    queryKey: ['author', pubkey ?? ''],
    queryFn: async () => {
      if (!pubkey) return {};

      // Queue this pubkey into the batch. All useAuthor calls in the same
      // JS tick are coalesced into one relay query by flushBatch().
      return new Promise((resolve) => {
        const entries = pendingByPubkey.get(pubkey) ?? [];
        entries.push({ resolve });
        pendingByPubkey.set(pubkey, entries);
        scheduleBatchFlush(nostr, queryClient);
      });
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: false,
  });
}

/**
 * Seed author data into the TanStack Query cache as fresh, so useAuthor()
 * won't trigger a refetch for these pubkeys. Called by useFeed's prefetch.
 */
export function seedAuthorCache(
  qc: QueryClient,
  pubkey: string,
  data: { event?: NostrEvent; metadata?: NostrMetadata },
) {
  qc.setQueryData(['author', pubkey], data, { updatedAt: Date.now() });
}
