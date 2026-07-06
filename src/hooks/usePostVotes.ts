import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { rollbackQuery } from '@/lib/optimisticEvent';

export type VoteDirection = '+' | '-';

export interface PostVotes {
  /** Net score: upvotes minus downvotes. */
  score: number;
  upvotes: number;
  downvotes: number;
  /** The logged-in user's current vote, if any. */
  myVote: VoteDirection | null;
  isLoading: boolean;
}

/**
 * Reddit-style voting on an event via NIP-25 reactions (kind 7).
 *
 * Every reactor's *latest* reaction counts once: `-` is a downvote,
 * anything else (`+`, empty, emoji) an upvote.
 */
export function usePostVotes(event: NostrEvent): PostVotes & {
  vote: (direction: VoteDirection) => void;
  isVoting: boolean;
} {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();

  const queryKey = useMemo(() => ['post-votes', event.id], [event.id]);

  const { data: reactions, isLoading } = useQuery({
    queryKey,
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(5000)]);
      return await nostr.query(
        [{ kinds: [7], '#e': [event.id], limit: 500 }],
        { signal },
      );
    },
    staleTime: 30_000,
  });

  const tally = useMemo(() => {
    // Latest reaction per pubkey wins.
    const latest = new Map<string, NostrEvent>();
    for (const reaction of reactions ?? []) {
      const existing = latest.get(reaction.pubkey);
      if (!existing || reaction.created_at > existing.created_at) {
        latest.set(reaction.pubkey, reaction);
      }
    }

    let upvotes = 0;
    let downvotes = 0;
    let myVote: VoteDirection | null = null;

    for (const [pubkey, reaction] of latest) {
      const direction: VoteDirection = reaction.content === '-' ? '-' : '+';
      if (direction === '-') downvotes++;
      else upvotes++;
      if (user && pubkey === user.pubkey) myVote = direction;
    }

    return { upvotes, downvotes, score: upvotes - downvotes, myVote };
  }, [reactions, user]);

  const voteMutation = useMutation({
    mutationFn: async (direction: VoteDirection) => {
      if (!user) throw new Error('User is not logged in');
      await publishEvent({
        kind: 7,
        content: direction,
        tags: [
          ['e', event.id, '', event.pubkey],
          ['p', event.pubkey],
          ['k', event.kind.toString()],
        ],
        created_at: Math.floor(Date.now() / 1000),
      });
    },
    onMutate: (direction: VoteDirection) => {
      if (!user) return undefined;
      const snapshot = queryClient.getQueryData<NostrEvent[]>(queryKey);
      const synthetic: NostrEvent = {
        id: `optimistic-${event.id}-${Date.now()}`,
        pubkey: user.pubkey,
        created_at: Math.floor(Date.now() / 1000),
        kind: 7,
        tags: [['e', event.id], ['p', event.pubkey]],
        content: direction,
        sig: '',
      };
      queryClient.setQueryData<NostrEvent[]>(queryKey, [
        ...(snapshot ?? []).filter((r) => r.pubkey !== user.pubkey),
        synthetic,
      ]);
      return { snapshot };
    },
    onError: (_err, _direction, ctx) => {
      rollbackQuery(queryClient, queryKey, ctx?.snapshot);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    ...tally,
    isLoading,
    vote: (direction: VoteDirection) => {
      if (tally.myVote === direction) return; // already voted this way
      voteMutation.mutate(direction);
    },
    isVoting: voteMutation.isPending,
  };
}
