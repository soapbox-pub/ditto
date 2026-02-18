import { type NostrEvent, type NostrMetadata, NSchema as n } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Module-level batcher: collects pubkeys requested in the same JS tick,
 * fires ONE relay query for all of them, distributes results back.
 *
 * For pubkeys the relay didn't return a profile for, we reject their
 * promise so TanStack Query marks them as errored and retries — rather
 * than permanently caching {} and showing the fallback name forever.
 */

type Nostr = ReturnType<typeof useNostr>['nostr'];
type QueryClient = ReturnType<typeof useQueryClient>;

interface PendingEntry {
  resolve: (data: { event?: NostrEvent; metadata?: NostrMetadata }) => void;
  reject: (err: Error) => void;
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
      for (const e of entries) e.reject(new Error('nostr not ready'));
    }
    return;
  }

  let profileEvents: NostrEvent[] = [];
  try {
    profileEvents = await nostr.query(
      [{ kinds: [0], authors: pubkeys }],
      { signal: AbortSignal.timeout(5000) },
    );
  } catch {
    // Relay error — resolve all with {} so components show fallback names
    // without triggering retries that would flood the relay
    for (const [, entries] of batch) {
      for (const e of entries) e.resolve({});
    }
    return;
  }

  const results = new Map<string, { event: NostrEvent; metadata?: NostrMetadata }>();
  for (const ev of profileEvents) {
    let metadata: NostrMetadata | undefined;
    try { metadata = n.json().pipe(n.metadata()).parse(ev.content); } catch { /* skip */ }
    results.set(ev.pubkey, { event: ev, metadata });
  }

  for (const [pubkey, entries] of batch) {
    const data = results.get(pubkey) ?? {};
    // Only seed cache for real profile data — don't permanently cache {}
    // for missing profiles (they may exist on other relays or be fetched later)
    if (results.has(pubkey)) {
      qc.setQueryData(['author', pubkey], data, { updatedAt: Date.now() });
    }
    for (const e of entries) e.resolve(data);
  }
}

export function useAuthor(pubkey: string | undefined) {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();

  return useQuery<{ event?: NostrEvent; metadata?: NostrMetadata }>({
    queryKey: ['author', pubkey ?? ''],
    queryFn: () => {
      if (!pubkey) return Promise.resolve({});

      // If the prefetch already seeded this while we were waiting to be called,
      // return it directly — no relay round trip needed.
      const seeded = queryClient.getQueryData<{ event?: NostrEvent; metadata?: NostrMetadata }>(['author', pubkey]);
      if (seeded !== undefined) return Promise.resolve(seeded);

      return new Promise((resolve, reject) => {
        const entries = pendingByPubkey.get(pubkey) ?? [];
        entries.push({ resolve, reject });
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
 * Seed author data into the TanStack Query cache as fresh so useAuthor()
 * won't refetch for these pubkeys within staleTime. Called by useFeed prefetch.
 */
export function seedAuthorCache(
  qc: QueryClient,
  pubkey: string,
  data: { event?: NostrEvent; metadata?: NostrMetadata },
) {
  qc.setQueryData(['author', pubkey], data, { updatedAt: Date.now() });
}
