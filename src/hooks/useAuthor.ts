import { type NostrEvent, type NostrMetadata, NSchema as n } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Batching layer — collects individual pubkey requests within a 50 ms window
// and resolves them all with a single relay query.
// ---------------------------------------------------------------------------

type NostrPool = ReturnType<typeof useNostr>['nostr'];

interface PendingRequest {
  resolve: (data: { event?: NostrEvent; metadata?: NostrMetadata }) => void;
  reject: (err: Error) => void;
}

/** Map of pubkey → pending resolvers, flushed every 50 ms. */
const pendingBatch = new Map<string, PendingRequest[]>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let currentPool: NostrPool | null = null;
let currentQueryClient: ReturnType<typeof useQueryClient> | null = null;

function flushBatch() {
  flushTimer = null;
  const pool = currentPool;
  const qc = currentQueryClient;
  if (!pool || !qc) return;

  // Snapshot & clear
  const batch = new Map(pendingBatch);
  pendingBatch.clear();

  const pubkeys = [...batch.keys()];
  if (pubkeys.length === 0) return;

  (async () => {
    try {
      const events = await pool.query(
        [{ kinds: [0], authors: pubkeys, limit: pubkeys.length }],
        { signal: AbortSignal.timeout(5000) },
      );

      // Index results by pubkey
      const byPubkey = new Map<string, NostrEvent>();
      for (const event of events) {
        const existing = byPubkey.get(event.pubkey);
        if (!existing || event.created_at > existing.created_at) {
          byPubkey.set(event.pubkey, event);
        }
      }

      // Resolve each pending request
      for (const [pk, resolvers] of batch) {
        const event = byPubkey.get(pk);
        let result: { event?: NostrEvent; metadata?: NostrMetadata };

        if (event) {
          let metadata: NostrMetadata | undefined;
          try {
            metadata = n.json().pipe(n.metadata()).parse(event.content);
          } catch {
            // unparseable
          }
          result = { event, metadata };
        } else {
          result = {};
        }

        // Seed individual cache
        qc.setQueryData(['author', pk], result);

        for (const r of resolvers) {
          r.resolve(result);
        }
      }
    } catch (err) {
      // Reject all pending
      for (const resolvers of batch.values()) {
        for (const r of resolvers) {
          r.reject(err instanceof Error ? err : new Error(String(err)));
        }
      }
    }
  })();
}

function fetchAuthorBatched(
  pubkey: string,
  pool: NostrPool,
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<{ event?: NostrEvent; metadata?: NostrMetadata }> {
  // Keep refs current so the flush uses the latest pool
  currentPool = pool;
  currentQueryClient = queryClient;

  return new Promise((resolve, reject) => {
    const existing = pendingBatch.get(pubkey);
    if (existing) {
      existing.push({ resolve, reject });
    } else {
      pendingBatch.set(pubkey, [{ resolve, reject }]);
    }

    // Schedule a flush if not already pending
    if (!flushTimer) {
      flushTimer = setTimeout(flushBatch, 50);
    }
  });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuthor(pubkey: string | undefined) {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();

  return useQuery<{ event?: NostrEvent; metadata?: NostrMetadata }>({
    queryKey: ['author', pubkey ?? ''],
    queryFn: async () => {
      if (!pubkey) {
        return {};
      }
      return fetchAuthorBatched(pubkey, nostr, queryClient);
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
