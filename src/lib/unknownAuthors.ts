import type { NostrFilter, NPool } from '@nostrify/nostrify';
import type { NIndexedDB } from '@nostrify/indexeddb';
import type { QueryClient } from '@tanstack/react-query';

import { authorQueryOptions } from '@/hooks/useAuthor';

/**
 * Follow lists per filter in the "does anyone you follow follow them" query.
 * Keeps each filter's `authors` well under the size relays accept, however
 * many people the reader follows; the filters still go out in one REQ.
 */
const AUTHORS_PER_FILTER = 500;

/**
 * Which of `pubkeys` are accounts the reader has no reason to know: no profile
 * (kind 0) anywhere we can find, and followed by nobody in `follows`.
 *
 * The shape of a throwaway spam key, which posts before it ever sets a name.
 * A real newcomer usually has a profile (signup makes one) or a friend who
 * followed them. Used to fold, never to drop.
 *
 * Profiles come through {@link authorQueryOptions}, the same query every
 * notification row's avatar already makes, so this costs no extra requests
 * for them. Only the profileless few go on to a follow-list query, limited to
 * the reader's follows.
 */
export async function findUnknownAuthors(
  nostr: NPool,
  queryClient: QueryClient,
  store: NIndexedDB,
  pubkeys: readonly string[],
  follows: readonly string[],
  signal: AbortSignal,
): Promise<Set<string>> {
  const unique = [...new Set(pubkeys)];
  if (unique.length === 0) return new Set();

  const profiles = await Promise.all(unique.map(async (pubkey) => {
    try {
      const result = await queryClient.fetchQuery(authorQueryOptions(nostr, queryClient, store, pubkey));
      return result.event !== undefined;
    } catch {
      // Couldn't tell: count it as known rather than fold someone real.
      return true;
    }
  }));
  const profileless = unique.filter((_, i) => !profiles[i]);
  if (profileless.length === 0) return new Set();

  const unknown = new Set(profileless);
  if (follows.length === 0) return unknown;

  const filters: NostrFilter[] = [];
  for (let i = 0; i < follows.length; i += AUTHORS_PER_FILTER) {
    filters.push({ kinds: [3], authors: follows.slice(i, i + AUTHORS_PER_FILTER), '#p': profileless });
  }
  try {
    const lists = await nostr.query(filters, { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) });
    for (const list of lists) {
      for (const tag of list.tags) {
        if (tag[0] === 'p') unknown.delete(tag[1]);
      }
    }
  } catch {
    // Couldn't ask: count them all as known.
    return new Set();
  }
  return unknown;
}
