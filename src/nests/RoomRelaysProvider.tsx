import { useMemo, type PropsWithChildren } from "react";
import { RoomRelaysContext } from "./roomRelaysContext";

interface RoomRelaysProviderProps {
  /** Effective relay list for the active room. */
  relays: string[];
}

/**
 * Scopes child components to a specific set of Nostr relays for the duration
 * of a room session. Room-scoped hooks (chat, presence, reactions, admin
 * commands, publish) pick this up via `useRoomNostr()` and route their
 * queries / subscriptions / publishes through these relays instead of (or in
 * addition to) the user's default pool.
 *
 * The relay list passed here should already be normalized and deduped. Empty
 * arrays are forwarded as `null` so the global pool is used instead.
 */
export function RoomRelaysProvider({ relays, children }: PropsWithChildren<RoomRelaysProviderProps>) {
  // Memoize on a stable key (sorted join) so identical relay sets don't
  // create a new context value and re-render every consumer.
  const value = useMemo(() => {
    if (!relays || relays.length === 0) return null;
    return [...relays].sort();
  }, [relays]);

  return (
    <RoomRelaysContext.Provider value={value}>
      {children}
    </RoomRelaysContext.Provider>
  );
}
