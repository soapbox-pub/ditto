import { useQuery } from '@tanstack/react-query';

import { getNip05Cached, setNip05Cached, deleteNip05Cached } from '@/lib/nip05Cache';

/**
 * Fetches a NIP-05 nostr.json URL.
 */
async function fetchNostrJson(url: URL, signal: AbortSignal): Promise<Record<string, unknown> | null> {
  // Try direct fetch first (works when server has proper CORS headers)
  try {
    const response = await fetch(url, { signal });
    if (response.ok) {
      return await response.json();
    }
  } catch {
    // fallthrough
  }
  return null;
}

/** Entries older than this are not trusted at all — show a skeleton instead. */
const MAX_CACHE_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Resolves a NIP-05 identifier to a pubkey by fetching the domain's
 * .well-known/nostr.json endpoint.
 *
 * Successful resolutions are persisted in IndexedDB so subsequent page
 * loads can render verified NIP-05 names instantly (no loading skeleton).
 * Entries younger than `staleTime` (1 h) render without any network
 * request.  Entries between 1 h and 7 days old render immediately while
 * a background re-check runs.  Entries older than 7 days are discarded
 * and a fresh verification is required.
 *
 * Accepts formats:
 * - `user@domain.com` → looks up `user` at `domain.com`
 * - `domain.com` (no @) → looks up `_` (default user) at `domain.com`
 */
export function useNip05Resolve(identifier: string | undefined) {
  // Read cache synchronously so TanStack Query can skip the pending state.
  const cached = identifier ? getNip05Cached(identifier) : undefined;

  // Discard entries that are too old to trust — force a fresh verification.
  const usableCache = cached && (Date.now() - cached.lastVerified < MAX_CACHE_AGE) ? cached : undefined;

  return useQuery<string | null>({
    queryKey: ['nip05-resolve', identifier],
    queryFn: async ({ signal }) => {
      if (!identifier) return null;

      let name: string;
      let domain: string;

      // Strip leading @ (e.g. "@chad@chadwick.site" from URLs like /@chad@chadwick.site)
      const cleaned = identifier.startsWith('@') ? identifier.slice(1) : identifier;

      if (cleaned.includes('@')) {
        const atIndex = cleaned.indexOf('@');
        name = cleaned.slice(0, atIndex);
        domain = cleaned.slice(atIndex + 1);
      } else {
        // No @ means it's just a domain, look up the default user (_)
        name = '_';
        domain = cleaned;
      }

      if (!domain) return null;

      const url = new URL('/.well-known/nostr.json', `https://${domain}`);
      url.searchParams.set('name', name);

      const fetchSignal = AbortSignal.any([signal, AbortSignal.timeout(800)]);

      const data = await fetchNostrJson(url, fetchSignal);
      if (!data) {
        // Network failure — don't evict cache; return null so TanStack Query
        // marks this as a failed fetch while the stale cached value remains.
        throw new Error(`NIP-05 fetch failed for ${identifier}`);
      }

      const names = data.names;
      if (!names || typeof names !== 'object') {
        // The domain responded but the identifier is gone — evict stale cache.
        void deleteNip05Cached(identifier);
        return null;
      }

      // Look up by exact name first; fall back to case-insensitive search
      // in case the server normalises casing differently from the stored metadata value
      const namesRecord = names as Record<string, string>;
      let pubkey: string | undefined = namesRecord[name];
      if (typeof pubkey !== 'string') {
        const entry = Object.entries(namesRecord).find(([k]) => k.toLowerCase() === name.toLowerCase());
        pubkey = entry?.[1];
      }
      if (typeof pubkey !== 'string') {
        // Identifier no longer in the JSON — evict stale cache.
        void deleteNip05Cached(identifier);
        return null;
      }

      // Persist the successful resolution to IndexedDB (fire-and-forget).
      void setNip05Cached(identifier, pubkey);

      return pubkey;
    },
    enabled: !!identifier,
    staleTime: 60 * 60 * 1000,  // 1 hour — NIP-05 records rarely change
    gcTime: 2 * 60 * 60 * 1000, // 2 hours
    retry: 1,

    // Seed from IndexedDB cache so the first render already has data.
    // TanStack Query compares initialDataUpdatedAt against staleTime:
    //   - < 1 h old  → fresh, no network request
    //   - 1 h – 7 d  → renders cached value, background refetch
    //   - > 7 d      → usableCache is undefined, normal pending/skeleton
    ...(usableCache
      ? {
        initialData: usableCache.pubkey,
        initialDataUpdatedAt: usableCache.lastVerified,
      }
      : {}),
  });
}
