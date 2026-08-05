import { useEffect, useState } from 'react';

import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { ARRIVAL_SETTLE_MS, isArrivalSettling, readFirstArrival } from '@/lib/firstArrival';

/**
 * Whether follow-up surfaces may start asking for attention.
 *
 * After the arrival transition hands over, the interface deserves a beat to
 * itself: the user has just been welcomed and should get to recognise where
 * they are before the Ditto Explorer introduction appears. Without this pause
 * the two reveals collide and neither reads as intentional.
 *
 * Derived from the persisted `consumedAt` rather than in-memory state, so it
 * survives the remount the reveal itself causes — and it is `true` immediately
 * for everyone who did not just arrive, which is almost everyone.
 */
export function useArrivalSettled(): boolean {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const pubkey = user?.pubkey;

  const [settled, setSettled] = useState(() => {
    if (!pubkey) return true;
    return !isArrivalSettling(readFirstArrival(config.appId, pubkey));
  });

  useEffect(() => {
    if (!pubkey) {
      setSettled(true);
      return;
    }
    const intent = readFirstArrival(config.appId, pubkey);
    if (!isArrivalSettling(intent)) {
      setSettled(true);
      return;
    }
    setSettled(false);
    const remaining = ARRIVAL_SETTLE_MS - (Date.now() - (intent?.consumedAt ?? 0));
    const timer = setTimeout(() => setSettled(true), Math.max(0, remaining));
    return () => clearTimeout(timer);
  }, [config.appId, pubkey]);

  return settled;
}
