import { useNostr } from '@nostrify/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent, NPool } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import {
  COMMUNITY_APPROVAL_KIND,
  communityModerators,
  communityRelayUrls,
  isCommunityModerator,
  type Community,
} from '@/lib/community';

/** A top-level community post with its moderation state and thread stats. */
export interface CommunityPost {
  /** The post event (kind 1111, or legacy kind 1). */
  event: NostrEvent;
  /** The community this post belongs to. */
  community: Community;
  /** Moderator approval events (kind 4550) referencing this post. */
  approvals: NostrEvent[];
  /**
   * Whether the post is visible in the community: it carries a moderator
   * approval, was authored by the owner / a moderator, or belongs to a
   * community that doesn't use kind 4550 approvals at all.
   */
  approved: boolean;
  /** Number of comments (all descendants) under this post. */
  commentCount: number;
}

function getTagValue(event: NostrEvent, name: string): string | undefined {
  return event.tags.find(([n]) => n === name)?.[1];
}

/**
 * Fetch posts + approvals for one or more communities in a single request,
 * and assemble them into {@link CommunityPost} objects.
 *
 * - Kind 1111 posts/replies tag the community with `A` (NIP-72 / NIP-22).
 * - Legacy kind 1 posts tag the community with lowercase `a`.
 * - Kind 4550 approvals are filtered by the union of all moderators at the
 *   relay, then validated per-community here — an approval only counts if
 *   its author moderates the specific community it approves for.
 * - Queries hit the app's relay pool AND the communities' own `relay`-tagged
 *   relays (NIP-72 communities usually live on specific relays, not the
 *   app's defaults).
 */
async function fetchCommunityPosts(
  nostr: NPool,
  communities: Community[],
  signal: AbortSignal,
): Promise<CommunityPost[]> {
  const byCoord = new Map(communities.map((c) => [c.coord, c]));
  const coords = [...byCoord.keys()];
  const allModerators = [...new Set(communities.flatMap(communityModerators))];

  const filters = [
    // NIP-72 posts and their nested replies (root-scoped uppercase A)
    { kinds: [1111], '#A': coords, limit: 200 },
    // Some clients only tag top-level posts with lowercase `a`
    { kinds: [1111], '#a': coords, limit: 200 },
    // Legacy kind 1 community posts
    { kinds: [1], '#a': coords, limit: 50 },
    // Approvals — pre-filtered to moderator authors, validated per-community below
    { kinds: [COMMUNITY_APPROVAL_KIND], '#a': coords, authors: allModerators, limit: 500 },
  ];

  // Query the app pool and the communities' preferred relays in parallel.
  // Community relays are best-effort — they may be offline or unreachable.
  const relayUrls = communityRelayUrls(communities);
  const [poolEvents, communityRelayEvents] = await Promise.all([
    nostr.query(filters, { signal }),
    relayUrls.length > 0
      ? nostr.group(relayUrls).query(filters, { signal }).catch(() => [] as NostrEvent[])
      : Promise.resolve([] as NostrEvent[]),
  ]);

  const events = [...new Map(
    [...poolEvents, ...communityRelayEvents].map((e) => [e.id, e]),
  ).values()];

  const approvalEvents = events.filter((e) => e.kind === COMMUNITY_APPROVAL_KIND);
  const contentEvents = events.filter((e) => e.kind !== COMMUNITY_APPROVAL_KIND);

  // Approvals keyed by post id, only where the approver moderates the
  // community named in the approval's own `a` tag. Also track which
  // communities actively use approvals at all.
  const approvalsByPostId = new Map<string, NostrEvent[]>();
  const moderatedCoords = new Set<string>();
  for (const approval of approvalEvents) {
    let trusted = false;
    for (const [name, value] of approval.tags) {
      if (name !== 'a' || !value) continue;
      const community = byCoord.get(value);
      if (community && isCommunityModerator(community, approval.pubkey)) {
        trusted = true;
        moderatedCoords.add(value);
      }
    }
    if (!trusted) continue;
    for (const [name, value] of approval.tags) {
      if (name === 'e' && value) {
        approvalsByPostId.set(value, [...(approvalsByPostId.get(value) ?? []), approval]);
      }
    }
  }

  // Resolve which community an event was posted to (first matching `a`/`A` tag).
  const communityOf = (event: NostrEvent): Community | undefined => {
    for (const [name, value] of event.tags) {
      if ((name === 'a' || name === 'A') && value && byCoord.has(value)) {
        return byCoord.get(value);
      }
    }
    return undefined;
  };

  // Top-level posts: kind 1111 with any `a` tag pointing at a community
  // (not just the first) and no parent `e` tag, or legacy kind 1 posts
  // that aren't replies.
  const topLevel = contentEvents.filter((event) => {
    if (event.kind === 1111) {
      const hasCommunityParent = event.tags.some(
        ([n, v]) => n === 'a' && !!v && byCoord.has(v),
      );
      return hasCommunityParent && !getTagValue(event, 'e');
    }
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

  return topLevel
    .flatMap((event) => {
      const community = communityOf(event);
      if (!community) return [];
      const approvals = approvalsByPostId.get(event.id) ?? [];
      // A post is visible when a moderator approved it, a moderator wrote
      // it, or the community doesn't use approvals at all (no kind 4550
      // from any moderator was found) — most real-world NIP-72 communities
      // never publish approvals, and hiding everything would make them
      // look permanently empty.
      const approved = approvals.length > 0 ||
        isCommunityModerator(community, event.pubkey) ||
        !moderatedCoords.has(community.coord);
      return [{
        event,
        community,
        approvals,
        approved,
        commentCount: countDescendants(event.id),
      }];
    })
    .sort((a, b) => b.event.created_at - a.event.created_at);
}

/** Fetch a single community's posts and moderator approvals. */
export function useCommunityPosts(community: Community | undefined) {
  const { nostr } = useNostr();

  return useQuery<CommunityPost[]>({
    queryKey: ['community-posts', community?.coord],
    queryFn: async (c) => {
      if (!community) throw new Error('community is required');
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(8000)]);
      return fetchCommunityPosts(nostr, [community], signal);
    },
    enabled: !!community,
    staleTime: 30_000,
  });
}

/**
 * Aggregated Reddit-style home feed: posts from all the given communities
 * (typically the user's joined list), newest first.
 */
export function useCommunitiesFeed(communities: Community[]) {
  const { nostr } = useNostr();
  const coords = communities.map((c) => c.coord).sort();

  return useQuery<CommunityPost[]>({
    queryKey: ['community-posts', 'feed', coords],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(8000)]);
      return fetchCommunityPosts(nostr, communities, signal);
    },
    enabled: communities.length > 0,
    staleTime: 30_000,
  });
}

/**
 * Publish a NIP-72 kind 4550 approval for a community post.
 *
 * The approval embeds the full approved event as JSON in `content` so the
 * post survives even if the author's relays drop it. Besides the app's
 * write relays, the approval is also delivered to the community's own
 * `relay`-tagged relays (best-effort).
 */
export function useApproveCommunityPost() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (post: CommunityPost) => {
      if (!user) throw new Error('User is not logged in');
      if (!isCommunityModerator(post.community, user.pubkey)) {
        throw new Error('Only moderators can approve posts');
      }

      const approval = await publishEvent({
        kind: COMMUNITY_APPROVAL_KIND,
        content: JSON.stringify(post.event),
        tags: [
          ['a', post.community.coord],
          ['e', post.event.id],
          ['p', post.event.pubkey],
          ['k', post.event.kind.toString()],
        ],
        created_at: Math.floor(Date.now() / 1000),
      });

      // Best-effort delivery to the community's preferred relays.
      const relayUrls = communityRelayUrls(post.community);
      if (relayUrls.length > 0) {
        nostr.group(relayUrls).event(approval).catch(() => {});
      }
    },
    onSuccess: () => {
      // Covers both single-community keys and the aggregated feed key.
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
    },
  });
}
