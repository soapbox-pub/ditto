import { NKinds, NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

/** A thread root, normalized to the identifiers needed to query and group its comments. */
type RootRef =
  | { type: 'external'; value: string }
  | { type: 'addr'; coord: string; id: string }
  | { type: 'event'; id: string };

/** The threaded view of a root's comments. */
interface CommentTree {
  allComments: NostrEvent[];
  topLevelComments: NostrEvent[];
  getDescendants: (commentId: string) => NostrEvent[];
  getDirectReplies: (commentId: string) => NostrEvent[];
}

export function useComments(
  root: NostrEvent | URL | `#${string}` | undefined,
  limit?: number,
  /**
   * Additional kinds to include alongside NIP-22 comments (1111) and voice
   * comments (1244) — e.g. kind 7516 geocache found logs, which reference
   * their cache with a lowercase `a` tag and belong in the same thread.
   */
  extraKinds?: number[],
) {
  const { nostr } = useNostr();

  // Reduce the root to primitives so `ref` — and therefore `select` — stays
  // referentially stable across renders even when the root object doesn't.
  const rootEvent = root && typeof root !== 'string' && !(root instanceof URL) ? root : undefined;
  const rootKey = root instanceof URL ? root.toString() : typeof root === 'string' ? root : root?.id;
  const rootKind = rootEvent?.kind;
  const rootPubkey = rootEvent?.pubkey;
  const rootD = rootEvent?.tags.find(([name]) => name === 'd')?.[1] ?? '';

  const ref = useMemo<RootRef | undefined>(() => {
    if (rootKey === undefined) return undefined;
    if (rootKind === undefined) return { type: 'external', value: rootKey };

    if (NKinds.addressable(rootKind) || NKinds.replaceable(rootKind)) {
      const d = NKinds.addressable(rootKind) ? rootD : '';
      return { type: 'addr', coord: `${rootKind}:${rootPubkey}:${d}`, id: rootKey };
    }

    return { type: 'event', id: rootKey };
  }, [rootKey, rootKind, rootPubkey, rootD]);

  // The query caches the raw comment list; the tree is derived here so that
  // optimistically inserted replies (see `insertReplyIntoThreads`) reshape it.
  const select = useCallback(
    (events: NostrEvent[]) => buildCommentTree(events, ref),
    [ref],
  );

  return useQuery({
    queryKey: ['nostr', 'comments', rootKey, limit, extraKinds ?? []],
    queryFn: async ({ signal }) => {
      if (!ref) throw new Error('root is required');
      const kinds = [1111, 1244, ...(extraKinds ?? [])];

      // NIP-22 says comments reference the root with UPPERCASE tags (A/E/I),
      // but real-world clients tag inconsistently — e.g. comments that
      // reference an addressable root only via uppercase E + the lowercase
      // `a` parent tag, omitting `A` entirely. Query the spec-correct
      // uppercase filter alongside lowercase compat filters (top-level
      // comments carry identical values in both cases) and, for addressable
      // roots, the root's current event id via `#E` — then dedupe.
      const filters: NostrFilter[] = [];

      switch (ref.type) {
        case 'external':
          filters.push({ kinds, '#I': [ref.value] }, { kinds, '#i': [ref.value] });
          break;
        case 'addr':
          filters.push({ kinds, '#A': [ref.coord] }, { kinds, '#a': [ref.coord] });
          // Synthetic roots reconstructed from a comment's tags may not know
          // the root's event id (no E tag on the comment) — skip the filter
          // rather than querying `#E: [""]`.
          if (ref.id) filters.push({ kinds, '#E': [ref.id] });
          break;
        case 'event':
          filters.push({ kinds, '#E': [ref.id] }, { kinds, '#e': [ref.id] });
          break;
      }

      if (typeof limit === 'number') {
        for (const filter of filters) filter.limit = limit;
      }

      // Query for all comments that reference this root regardless of depth
      const abort = AbortSignal.any([signal, AbortSignal.timeout(5000)]);
      const rawEvents = await nostr.query(filters, { signal: abort });

      // Dedupe — the same comment usually matches several of the filters above
      return [...new Map(rawEvents.map((e) => [e.id, e])).values()];
    },
    select,
    enabled: !!root,
  });
}

/** Read the first value of a tag. */
function getTagValue(event: NostrEvent, tagName: string): string | undefined {
  return event.tags.find(([name]) => name === tagName)?.[1];
}

/** Group a flat comment list into the threaded shape consumers render from. */
function buildCommentTree(events: NostrEvent[], ref: RootRef | undefined): CommentTree {
  // Index children by their lowercase `e` parent tag up front, so descendant
  // lookups don't rescan the whole list once per comment.
  const childrenByParent = new Map<string, NostrEvent[]>();

  for (const event of events) {
    const parent = getTagValue(event, 'e');
    if (!parent) continue;
    const siblings = childrenByParent.get(parent);
    if (siblings) {
      siblings.push(event);
    } else {
      childrenByParent.set(parent, [event]);
    }
  }

  const oldestFirst = (a: NostrEvent, b: NostrEvent) => a.created_at - b.created_at;

  // Top-level comments are those whose lowercase parent tag matches the root.
  const isTopLevel = (comment: NostrEvent): boolean => {
    if (!ref) return false;

    switch (ref.type) {
      case 'external':
        return getTagValue(comment, 'i') === ref.value;
      case 'addr':
        // Some clients parent-tag the addressable root's event id (`e`)
        // instead of (or alongside) its coordinates (`a`).
        return getTagValue(comment, 'a') === ref.coord ||
          (!!ref.id && getTagValue(comment, 'e') === ref.id);
      case 'event':
        return getTagValue(comment, 'e') === ref.id;
    }
  };

  return {
    allComments: events,
    // Newest first for top-level comments
    topLevelComments: events.filter(isTopLevel).sort((a, b) => b.created_at - a.created_at),
    getDescendants: (commentId: string) => {
      const descendants: NostrEvent[] = [];
      const seen = new Set<string>([commentId]);
      const queue = [commentId];

      // Walk iteratively with a seen-set: relay data is untrusted, and two
      // events that `e`-tag each other would trap a naive recursion.
      while (queue.length) {
        for (const child of childrenByParent.get(queue.pop()!) ?? []) {
          if (seen.has(child.id)) continue;
          seen.add(child.id);
          descendants.push(child);
          queue.push(child.id);
        }
      }

      return descendants.sort(oldestFirst);
    },
    getDirectReplies: (commentId: string) =>
      [...(childrenByParent.get(commentId) ?? [])].sort(oldestFirst),
  };
}
