import { NKinds, type NostrEvent } from '@nostrify/nostrify';
import type { QueryClient, QueryKey } from '@tanstack/react-query';

/** A thread root: a Nostr event, a URL, or a NIP-73 external identifier. */
export type ThreadRoot = NostrEvent | URL | `#${string}`;

/** Tag names a reply uses to point at its thread root or its immediate parent. */
const REFERENCE_TAGS = new Set(['e', 'E', 'a', 'A', 'i', 'I']);

/** Describes a cached list of replies that a new reply may belong to. */
interface ReplyList {
  /** Query key prefix identifying the list. */
  prefix: QueryKey;
  /** Index into the query key holding the thread root identifier. */
  rootIndex: number;
  /** How the cached array is ordered. */
  order: 'asc' | 'desc';
}

/**
 * Every cached list a reply can land in. All three cache a flat
 * `NostrEvent[]` and derive their tree structure downstream.
 */
const REPLY_LISTS: ReplyList[] = [
  { prefix: ['replies'], rootIndex: 1, order: 'asc' }, // useReplies
  { prefix: ['nostr', 'comments'], rootIndex: 2, order: 'asc' }, // useComments
  { prefix: ['event-comments'], rootIndex: 1, order: 'desc' }, // CommentsSheet
];

/** Every root/parent identifier a reply references, across NIP-10 and NIP-22 tag styles. */
function referencedIds(reply: NostrEvent): Set<string> {
  const refs = new Set<string>();

  for (const [name, value] of reply.tags) {
    if (value && REFERENCE_TAGS.has(name)) {
      refs.add(value);
    }
  }

  return refs;
}

/**
 * The identifiers a thread root can appear as in a query key. Comment lists
 * key addressable and replaceable roots by their `kind:pubkey:d` coordinates,
 * everything else by event id.
 */
function rootKeys(root: ThreadRoot | undefined): Set<string> {
  const keys = new Set<string>();

  if (!root) return keys;
  if (typeof root === 'string') return keys.add(root);
  if (root instanceof URL) return keys.add(root.toString());

  if (root.id) keys.add(root.id);

  if (NKinds.addressable(root.kind) || NKinds.replaceable(root.kind)) {
    const d = NKinds.addressable(root.kind)
      ? root.tags.find(([name]) => name === 'd')?.[1] ?? ''
      : '';
    keys.add(`${root.kind}:${root.pubkey}:${d}`);
  }

  return keys;
}

/**
 * Optimistically add a freshly published reply to every cached thread it
 * belongs to, so it appears immediately on the thread view instead of after a
 * relay round-trip.
 *
 * Like `prependEventToFeeds`, this marks the affected queries stale WITHOUT
 * refetching: relays need a moment to index a write, so an immediate refetch
 * comes back without the reply and wholesale-replaces the optimistic entry.
 * The next natural refetch (remount, focus, poll) happens after indexing.
 *
 * Pass `root` when the caller knows it — NIP-22 replies address a root that
 * isn't necessarily the event being replied to. Kind 1 replies can omit it,
 * since NIP-10 reply tags name the thread root directly.
 */
export function insertReplyIntoThreads(
  queryClient: QueryClient,
  reply: NostrEvent,
  root?: ThreadRoot,
): void {
  const refs = referencedIds(reply);
  const roots = rootKeys(root);

  for (const { prefix, rootIndex, order } of REPLY_LISTS) {
    for (const query of queryClient.getQueryCache().findAll({ queryKey: prefix, type: 'active' })) {
      const key = query.queryKey[rootIndex];
      if (typeof key !== 'string' || !key) continue;

      queryClient.setQueryData<NostrEvent[]>(query.queryKey, (prev) => {
        if (!prev || prev.some((e) => e.id === reply.id)) return prev;

        // The reply belongs to this thread if it points at the root, or at an
        // event already in it — deep replies often tag only their parent.
        const belongs = roots.has(key) || refs.has(key) || prev.some((e) => refs.has(e.id));
        if (!belongs) return prev;

        return [...prev, reply].sort((a, b) =>
          order === 'asc' ? a.created_at - b.created_at : b.created_at - a.created_at
        );
      });
    }

    queryClient.invalidateQueries({ queryKey: prefix, refetchType: 'none' });
  }
}
