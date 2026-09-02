import { useCallback, useMemo } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFollowList } from '@/hooks/useFollowActions';
import { mentionSwarmIds } from '@/lib/mentionSwarm';
import { replyFloodIds } from '@/lib/replyFlood';

export interface UseNotificationFloodReturn {
  /**
   * The ids of notifications in `events` that belong to a visual flood and
   * should collapse into a single expandable row. Pure over the batch — pass
   * the whole loaded notification list, not one event at a time. The reader's
   * own events and events from anyone they follow are never flagged.
   */
  floodIds: (events: readonly NostrEvent[]) => Set<string>;
}

/**
 * Flood detection for the notification inbox, scoped to the reading user.
 *
 * Runs the two orthogonal rules and unions their verdicts, because the
 * campaigns they catch are opposites and a spammer picks one:
 *
 *  - {@link replyFloodIds} reads CONTENT — one pitch echoed across a crowd, or
 *    hammered by a single key. The thread detector, reused as-is.
 *  - {@link mentionSwarmIds} reads the ENVELOPE — a burst of one-shot strangers
 *    all naming the same co-victims. This is what catches a generator that
 *    writes a unique message every time, which content clustering cannot see.
 *
 * A DISPLAY heuristic: the returned ids are folded into an expandable row,
 * never dropped. See `src/lib/replyFlood.ts` and `src/lib/mentionSwarm.ts` for
 * the rules and their limits.
 */
export function useNotificationFlood(): UseNotificationFloodReturn {
  const { user } = useCurrentUser();
  const { data: followList } = useFollowList();

  const self = user?.pubkey;
  const followPubkeys = followList?.pubkeys;

  const follows = useMemo(() => {
    if (!followPubkeys?.length) return undefined;
    return new Set(followPubkeys);
  }, [followPubkeys]);

  const floodIds = useCallback(
    (events: readonly NostrEvent[]): Set<string> => {
      const opts = {
        ...(self !== undefined ? { self } : {}),
        ...(follows !== undefined ? { follows } : {}),
      };
      // replyFloodIds returns a fresh set, so the swarm ids can merge into it.
      const ids = replyFloodIds(events, opts);
      for (const id of mentionSwarmIds(events, opts)) ids.add(id);
      return ids;
    },
    [self, follows],
  );

  return { floodIds };
}
