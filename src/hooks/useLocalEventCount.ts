import { useCallback, useEffect, useState } from 'react';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrStorage } from '@/hooks/useNostrStorage';

/**
 * How many of the logged-in user's own events the local store holds.
 *
 * `undefined` while loading, or when the count can't be taken — IndexedDB is
 * unavailable under iOS Lockdown Mode and in some private-browsing modes, where
 * the store degrades to a permanent no-op rather than throwing.
 */
export function useLocalEventCount() {
  const { store } = useNostrStorage();
  const { user } = useCurrentUser();

  const [count, setCount] = useState<number | undefined>(undefined);

  const refresh = useCallback(async () => {
    if (!user) {
      setCount(undefined);
      return;
    }
    try {
      const result = await store.count([{ authors: [user.pubkey] }]);
      setCount(result.count);
    } catch {
      setCount(undefined);
    }
  }, [store, user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { count, refresh };
}
