import { useNostr } from '@nostrify/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import {
  COMMUNITY_APPROVAL_KIND,
  communityModerators,
  isCommunityModerator,
  type Community,
} from '@/lib/community';

/** A top-level community post with its moderation state and thread stats. */
export interface CommunityPost {
  /** The post event (kind 1111, or legacy kind 1). */
  event: NostrEvent;
  /** Moderator approval events (kind 4550) referencing this post. */
  approvals: NostrEvent[];
  /**
   * Whether the post is approved: it carries a moderator approval, or was
   * authored by the community owner / a moderator (implicitly approved).
   */
  approved: boolean;
  /** Number of comments (all descendants) under this post. */
  commentCount: number;
}

interface CommunityPostsResult {
  /** All top-level posts, newest first. */
  posts: CommunityPost[];
  /** Approved posts only. */
  approved: CommunityPost[];
  /** Posts awaiting moderator approval. */
  pending: CommunityPost[];
}

function getTagValue(event: NostrEvent, name: string): string | undefined {
  return event.tags.find(([n]) => n === name)?.[1];
}

/**
 * Fetch a community's posts and moderator approvals in a single request.
 *
 * - Kind 1111 posts/replies tag the community with `A` (NIP-72 / NIP-22).
 * - Legacy kind 1 posts tag the community with lowercase `a`.
 * - Kind 4550 approvals are only trusted from the community owner and
 *   moderators (`authors` filter — anyone can publish an approval event).
 */
export function useCommunityPosts(community: Community | undefined) {
  const { nostr } = useNostr();

  return useQuery<CommunityPostsResult>({
    queryKey: ['community-posts', community?.coord],
    queryFn: async (c) => {
      if (!community) throw new Error('community is required');
      const { coord } = community;
      const moderators = communityModerators(community);
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(8000)]);

      const rawEvents = await nostr.query([
        // NIP-72 posts and their nested replies (root-scoped uppercase A)
        { kinds: [1111], '#A': [coord], limit: 200 },
        // Some clients only tag top-level posts with lowercase `a`
        { kinds: [1111], '#a': [coord], limit: 200 },
        // Legacy kind 1 community posts
        { kinds: [1], '#a': [coord], limit: 50 },
        // Moderator approvals — trust only the owner + listed moderators
        { kinds: [COMMUNITY_APPROVAL_KIND], '#a': [coord], authors: moderators, limit: 500 },
      ], { signal });

      const events = [...new Map(rawEvents.map((e) => [e.id, e])).values()];

      const approvalEvents = events.filter((e) => e.kind === COMMUNITY_APPROVAL_KIND);
      const contentEvents = events.filter((e) => e.kind !== COMMUNITY_APPROVAL_KIND);

      // Approvals keyed by the approved post's event id (`e` tag).
      const approvalsByPostId = new Map<string, NostrEvent[]>();
      for (const approval of approvalEvents) {
        for (const [name, value] of approval.tags) {
          if (name === 'e' && value) {
            approvalsByPostId.set(value, [...(approvalsByPostId.get(value) ?? []), approval]);
          }
        }
      }

      // Top-level posts: kind 1111 whose lowercase `a` (parent) is the
      // community itself, or legacy kind 1 posts that aren't replies.
      const topLevel = contentEvents.filter((event) => {
        if (event.kind === 1111) {
          return getTagValue(event, 'a') === coord && !getTagValue(event, 'e');
        }
        // Legacy kind 1: treat non-replies as top-level posts.
        return !event.tags.some(([n]) => n === 'e');
      });

      // Count all descendants per post from the same result set.
      const childrenByParent = new Map<string, string[]>();
      for (const event of contentEvents) {
        const parentId = getTagValue(event, 'e');
        if (parentId) {
          childrenByParent.set(parentId, [...(childrenByParent.get(parentId) ?? []), event.id]);
        }
      }
      const countDescendants = (id: string, seen = new Set<string>()): number => {
        if (seen.has(id)) return 0;
        seen.add(id);
        const children = childrenByParent.get(id) ?? [];
        return children.reduce((sum, child) => sum + 1 + countDescendants(child, seen), 0);
      };

      const posts: CommunityPost[] = topLevel
        .map((event) => {
          const approvals = approvalsByPostId.get(event.id) ?? [];
          return {
            event,
            approvals,
            approved: approvals.length > 0 || isCommunityModerator(community, event.pubkey),
            commentCount: countDescendants(event.id),
          };
        })
        .sort((a, b) => b.event.created_at - a.event.created_at);

      return {
        posts,
        approved: posts.filter((p) => p.approved),
        pending: posts.filter((p) => !p.approved),
      };
    },
    enabled: !!community,
    staleTime: 30_000,
  });
}

/**
 * Publish a NIP-72 kind 4550 approval for a community post.
 *
 * The approval embeds the full approved event as JSON in `content` so the
 * post survives even if the author's relays drop it.
 */
export function useApproveCommunityPost(community: Community | undefined) {
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (post: NostrEvent) => {
      if (!community) throw new Error('community is required');
      if (!user) throw new Error('User is not logged in');
      if (!isCommunityModerator(community, user.pubkey)) {
        throw new Error('Only moderators can approve posts');
      }

      await publishEvent({
        kind: COMMUNITY_APPROVAL_KIND,
        content: JSON.stringify(post),
        tags: [
          ['a', community.coord],
          ['e', post.id],
          ['p', post.pubkey],
          ['k', post.kind.toString()],
        ],
        created_at: Math.floor(Date.now() / 1000),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community-posts', community?.coord] });
    },
  });
}
