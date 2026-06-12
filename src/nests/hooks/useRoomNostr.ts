import { useMemo } from "react";
import { useNostr } from "@nostrify/react";
import { useRoomRelays } from "../roomRelaysContext";

/**
 * Like `useNostr()`, but when inside a `RoomRelaysProvider` returns a pool
 * scoped to the room's effective relay set (user relays union room `relays`
 * tag union naddr relay hints).
 *
 * Outside a room, returns the global pool unchanged.
 *
 * The scoped pool is created via `NPool.group(urls)`, which shares relay
 * connections with the parent pool — so adding a room-specific relay does
 * not duplicate WebSockets that the global pool already has open.
 *
 * The returned `nostr` reference is stable across renders for an unchanged
 * relay set, so `useQuery`/`useEffect` deps that depend on it won't churn.
 */
export function useRoomNostr() {
  const { nostr } = useNostr();
  const roomRelays = useRoomRelays();

  const key = roomRelays?.join("|") ?? "";

  const scoped = useMemo(() => {
    if (!roomRelays || roomRelays.length === 0) return nostr;
    return nostr.group(roomRelays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nostr, key]);

  return { nostr: scoped };
}
