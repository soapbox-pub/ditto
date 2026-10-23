import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from './useCurrentUser';
import { SEAL_ICONS, type SealIcon } from '@/lib/letterTypes';

const UNLOCKABLE = SEAL_ICONS.filter((i) => i.unlock);

/**
 * Seal stamps the current user has earned by publishing with other apps
 * (a treasure, a color moment, a theme...). One filter per app, all in a
 * single request; any event of the app's kinds by the user unlocks it.
 */
export function useUnlockedSeals() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery({
    queryKey: ['unlocked-seals', user?.pubkey],
    queryFn: async ({ signal }): Promise<Set<SealIcon>> => {
      if (!user) return new Set();
      const events = await nostr.query(
        UNLOCKABLE.map((i) => ({ kinds: i.unlock!.kinds, authors: [user.pubkey], limit: 1 })),
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );
      return new Set(
        UNLOCKABLE
          .filter((i) => events.some((e) => e.pubkey === user.pubkey && i.unlock!.kinds.includes(e.kind)))
          .map((i) => i.id),
      );
    },
    enabled: !!user,
    staleTime: 10 * 60 * 1000,
  });
}
