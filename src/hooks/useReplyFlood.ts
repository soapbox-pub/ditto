import { useCallback, useMemo } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFollowList } from '@/hooks/useFollowActions';
import { replyFloodIds } from '@/lib/replyFlood';

export interface UseReplyFloodReturn {
  /**
   * The ids of replies in `replies` that belong to a visual flood and should
   * collapse into a single expandable row. Pure over the batch — pass the whole
   * flat reply set for one thread, not one event at a time. The reader's own
   * replies and replies from anyone they follow are never flagged.
   */
  floodIds: (replies: readonly NostrEvent[]) => Set<string>;
}

/**
 * Reply-flood detection for a note thread, scoped to the reading user.
 *
 * Mirrors the shape of {@link useMuteFilter}, but operates on the whole reply
 * batch rather than one event — flood detection is a property of the crowd (one
 * pitch across many pubkeys), which a per-event predicate cannot see. The
 * returned callback closes over `self` + the follow set, so the caller passes
 * only the reply array.
 *
 * A DISPLAY heuristic: the returned ids are folded into an expandable row, never
 * dropped. See `src/lib/replyFlood.ts` for the rules and their limits.
 */
export function useReplyFlood(): UseReplyFloodReturn {
  const { user } = useCurrentUser();
  const { data: followList } = useFollowList();

  const self = user?.pubkey;
  const followPubkeys = followList?.pubkeys;

  const follows = useMemo(() => {
    if (!followPubkeys?.length) return undefined;
    return new Set(followPubkeys);
  }, [followPubkeys]);

  const floodIds = useCallback(
    (replies: readonly NostrEvent[]): Set<string> =>
      replyFloodIds(replies, {
        ...(self !== undefined ? { self } : {}),
        ...(follows !== undefined ? { follows } : {}),
      }),
    [self, follows],
  );

  return { floodIds };
}
