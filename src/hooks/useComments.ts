import { NKinds, NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

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

  return useQuery({
    queryKey: ['nostr', 'comments', root instanceof URL ? root.toString() : typeof root === 'string' ? root : root?.id, limit, extraKinds ?? []],
    queryFn: async () => {
      if (!root) throw new Error('root is required');
      const kinds = [1111, 1244, ...(extraKinds ?? [])];

      // NIP-22 says comments reference the root with UPPERCASE tags (A/E/I),
      // but real-world clients tag inconsistently — e.g. comments that
      // reference an addressable root only via uppercase E + the lowercase
      // `a` parent tag, omitting `A` entirely. Query the spec-correct
      // uppercase filter alongside lowercase compat filters (top-level
      // comments carry identical values in both cases) and, for addressable
      // roots, the root's current event id via `#E` — then dedupe.
      const filters: NostrFilter[] = [];

      if (typeof root === 'string') {
        filters.push({ kinds, '#I': [root] });
        filters.push({ kinds, '#i': [root] });
      } else if (root instanceof URL) {
        filters.push({ kinds, '#I': [root.toString()] });
        filters.push({ kinds, '#i': [root.toString()] });
      } else if (NKinds.addressable(root.kind) || NKinds.replaceable(root.kind)) {
        const d = NKinds.addressable(root.kind)
          ? root.tags.find(([name]) => name === 'd')?.[1] ?? ''
          : '';
        const coord = `${root.kind}:${root.pubkey}:${d}`;
        filters.push({ kinds, '#A': [coord] });
        filters.push({ kinds, '#a': [coord] });
        // Synthetic roots reconstructed from a comment's tags may not know
        // the root's event id (no E tag on the comment) — skip the filter
        // rather than querying `#E: [""]`.
        if (root.id) filters.push({ kinds, '#E': [root.id] });
      } else {
        filters.push({ kinds, '#E': [root.id] });
        filters.push({ kinds, '#e': [root.id] });
      }

      if (typeof limit === 'number') {
        for (const filter of filters) filter.limit = limit;
      }

      // Query for all comments that reference this root regardless of depth
      const signal = AbortSignal.timeout(5000);
      const rawEvents = await nostr.query(filters, { signal });

      // Dedupe — the same comment usually matches several of the filters above
      const events = [...new Map(rawEvents.map((e) => [e.id, e])).values()];

      // Helper function to get tag value
      const getTagValue = (event: NostrEvent, tagName: string): string | undefined => {
        const tag = event.tags.find(([name]) => name === tagName);
        return tag?.[1];
      };

      // Filter top-level comments (those with lowercase tag matching the root)
      const topLevelComments = events.filter(comment => {
        if (typeof root === 'string') {
          return getTagValue(comment, 'i') === root;
        } else if (root instanceof URL) {
          return getTagValue(comment, 'i') === root.toString();
        } else if (NKinds.addressable(root.kind)) {
          const d = getTagValue(root, 'd') ?? '';
          // Some clients parent-tag the addressable root's event id (`e`)
          // instead of (or alongside) its coordinates (`a`).
          return getTagValue(comment, 'a') === `${root.kind}:${root.pubkey}:${d}` ||
            getTagValue(comment, 'e') === root.id;
        } else if (NKinds.replaceable(root.kind)) {
          return getTagValue(comment, 'a') === `${root.kind}:${root.pubkey}:` ||
            getTagValue(comment, 'e') === root.id;
        } else {
          return getTagValue(comment, 'e') === root.id;
        }
      });

      // Helper function to get all descendants of a comment
      const getDescendants = (parentId: string): NostrEvent[] => {
        const directReplies = events.filter(comment => {
          const eTag = getTagValue(comment, 'e');
          return eTag === parentId;
        });

        const allDescendants = [...directReplies];
        
        // Recursively get descendants of each direct reply
        for (const reply of directReplies) {
          allDescendants.push(...getDescendants(reply.id));
        }

        return allDescendants;
      };

      // Create a map of comment ID to its descendants
      const commentDescendants = new Map<string, NostrEvent[]>();
      for (const comment of events) {
        commentDescendants.set(comment.id, getDescendants(comment.id));
      }

      // Sort top-level comments by creation time (newest first)
      const sortedTopLevel = topLevelComments.sort((a, b) => b.created_at - a.created_at);

      return {
        allComments: events,
        topLevelComments: sortedTopLevel,
        getDescendants: (commentId: string) => {
          const descendants = commentDescendants.get(commentId) || [];
          // Sort descendants by creation time (oldest first for threaded display)
          return descendants.sort((a, b) => a.created_at - b.created_at);
        },
        getDirectReplies: (commentId: string) => {
          const directReplies = events.filter(comment => {
            const eTag = getTagValue(comment, 'e');
            return eTag === commentId;
          });
          // Sort direct replies by creation time (oldest first for threaded display)
          return directReplies.sort((a, b) => a.created_at - b.created_at);
        }
      };
    },
    enabled: !!root,
  });
}
