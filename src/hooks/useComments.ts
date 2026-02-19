import { NKinds, NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useNip85EventStats, useNip85AddrStats } from '@/hooks/useNip85Stats';

export function useComments(root: NostrEvent | URL, limit?: number) {
  const { nostr } = useNostr();

  // Determine the identifier for NIP-85 stats
  let nip85Identifier: string | undefined;
  let nip85Type: 'event' | 'addr' | undefined;
  
  if (root instanceof URL) {
    // URLs don't have NIP-85 stats
    nip85Identifier = undefined;
  } else if (NKinds.addressable(root.kind)) {
    const d = root.tags.find(([name]) => name === 'd')?.[1] ?? '';
    nip85Identifier = `${root.kind}:${root.pubkey}:${d}`;
    nip85Type = 'addr';
  } else if (NKinds.replaceable(root.kind)) {
    nip85Identifier = `${root.kind}:${root.pubkey}:`;
    nip85Type = 'addr';
  } else {
    nip85Identifier = root.id;
    nip85Type = 'event';
  }

  const nip85EventStats = useNip85EventStats(nip85Type === 'event' ? nip85Identifier : undefined);
  const nip85AddrStats = useNip85AddrStats(nip85Type === 'addr' ? nip85Identifier : undefined);
  const nip85Stats = nip85Type === 'event' ? nip85EventStats.data : nip85AddrStats.data;

  return useQuery({
    queryKey: ['nostr', 'comments', root instanceof URL ? root.toString() : root.id, limit, nip85Stats],
    queryFn: async (c) => {
      // If we have NIP-85 comment count and no limit specified, use a smaller default limit
      const hasNip85CommentCount = !!nip85Stats?.commentCount;
      const effectiveLimit = limit ?? (hasNip85CommentCount ? 10 : undefined);

      const filter: NostrFilter = { kinds: [1111] };

      if (root instanceof URL) {
        filter['#I'] = [root.toString()];
      } else if (NKinds.addressable(root.kind)) {
        const d = root.tags.find(([name]) => name === 'd')?.[1] ?? '';
        filter['#A'] = [`${root.kind}:${root.pubkey}:${d}`];
      } else if (NKinds.replaceable(root.kind)) {
        filter['#A'] = [`${root.kind}:${root.pubkey}:`];
      } else {
        filter['#E'] = [root.id];
      }

      if (typeof effectiveLimit === 'number') {
        filter.limit = effectiveLimit;
      }

      // Query for all kind 1111 comments that reference this addressable event regardless of depth
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(5000)]);
      const events = await nostr.query([filter], { signal });

      // Helper function to get tag value
      const getTagValue = (event: NostrEvent, tagName: string): string | undefined => {
        const tag = event.tags.find(([name]) => name === tagName);
        return tag?.[1];
      };

      // Filter top-level comments (those with lowercase tag matching the root)
      const topLevelComments = events.filter(comment => {
        if (root instanceof URL) {
          return getTagValue(comment, 'i') === root.toString();
        } else if (NKinds.addressable(root.kind)) {
          const d = getTagValue(root, 'd') ?? '';
          return getTagValue(comment, 'a') === `${root.kind}:${root.pubkey}:${d}`;
        } else if (NKinds.replaceable(root.kind)) {
          return getTagValue(comment, 'a') === `${root.kind}:${root.pubkey}:`;
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
        },
        nip85Stats,
      };
    },
    enabled: !!root,
  });
}