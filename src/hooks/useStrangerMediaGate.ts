import { useMemo } from 'react';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFollowList } from '@/hooks/useFollowActions';

/**
 * Whether media from `pubkey` should be gated behind a click-to-reveal overlay,
 * per the `hideMediaFromStrangers` setting.
 *
 * Returns false — i.e. show media normally — when:
 * - the setting is off,
 * - the viewer is logged out (no follow list to compare against, so gating
 *   would blur the entire feed for anonymous visitors), or
 * - the author is the viewer or someone they follow.
 */
export function useStrangerMediaGate(pubkey: string): boolean {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { data: followData } = useFollowList();

  const followed = useMemo(
    () => new Set(followData?.pubkeys ?? []),
    [followData],
  );

  if (!config.hideMediaFromStrangers || !user) return false;
  if (pubkey === user.pubkey || followed.has(pubkey)) return false;
  return true;
}
