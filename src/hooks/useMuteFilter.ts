import { useCallback, useMemo } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';

import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFollowList } from '@/hooks/useFollowActions';
import { useMuteList, type MuteListItem } from '@/hooks/useMuteList';
import { isEventMuted } from '@/lib/muteHelpers';

export interface UseMuteFilterReturn {
  /** Raw mute list items (same as `useMuteList().muteItems`). */
  muteItems: MuteListItem[];
  /**
   * Whether an event should be hidden by the user's mute list.
   * Muted hashtags and words are never applied to the current user's own
   * posts. When the `exemptFollowsFromFilters` setting is enabled, they are
   * likewise not applied to accounts the user follows — explicit pubkey and
   * thread mutes still are.
   */
  isMuted: (event: NostrEvent) => boolean;
}

/**
 * Mute-list event filter that honors the "Don't filter people you follow"
 * setting (`config.exemptFollowsFromFilters`).
 *
 * Prefer this over calling `isEventMuted(event, muteItems)` directly so the
 * follow exemption is applied consistently across feeds, threads, and guards.
 */
export function useMuteFilter(): UseMuteFilterReturn {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { muteItems } = useMuteList();
  const { data: followList } = useFollowList();

  const exemptFollows = config.exemptFollowsFromFilters === true;
  const followPubkeys = followList?.pubkeys;

  // Only materialize the follow set when the exemption is on, so the returned
  // callback (and everything memoized on it) is unaffected otherwise.
  const exemptPubkeys = useMemo(() => {
    if (!exemptFollows || !followPubkeys?.length) return undefined;
    return new Set(followPubkeys);
  }, [exemptFollows, followPubkeys]);

  const selfPubkey = user?.pubkey;

  const isMuted = useCallback((event: NostrEvent): boolean => {
    if (muteItems.length === 0) return false;
    const skipContentMutes = event.pubkey === selfPubkey ||
      exemptPubkeys?.has(event.pubkey) === true;
    return isEventMuted(event, muteItems, { skipContentMutes });
  }, [muteItems, exemptPubkeys, selfPubkey]);

  return { muteItems, isMuted };
}
