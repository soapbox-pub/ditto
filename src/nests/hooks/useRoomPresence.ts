import { useQuery } from "@tanstack/react-query";
import type { NostrEvent } from "@nostrify/nostrify";
import { NESTS_PRESENCE_KIND } from "../lib/const";
import { useRoomNostr } from "./useRoomNostr";

/**
 * Query kind:10312 presence events for a room.
 * Presence events expire after 5 minutes.
 *
 * Inside a `RoomRelaysProvider` the query is scoped to the room's relays;
 * elsewhere (e.g. lobby cards) it uses the global pool.
 */
export function useRoomPresence(roomATag: string | undefined) {
  const { nostr } = useRoomNostr();

  return useQuery({
    queryKey: ["nests", "room-presence", roomATag ?? ""],
    queryFn: async () => {
      if (!roomATag) return [];

      const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 300;

      const events = await nostr.query(
        [{ kinds: [NESTS_PRESENCE_KIND], "#a": [roomATag], since: fiveMinutesAgo, limit: 200 }],
        { signal: AbortSignal.timeout(3000) },
      );

      // Deduplicate by pubkey (keep latest)
      const byPubkey = new Map<string, NostrEvent>();
      for (const event of events) {
        const existing = byPubkey.get(event.pubkey);
        if (!existing || event.created_at > existing.created_at) {
          byPubkey.set(event.pubkey, event);
        }
      }

      // Filter to only recent events
      return Array.from(byPubkey.values()).filter(
        (e) => e.created_at >= fiveMinutesAgo,
      );
    },
    enabled: !!roomATag,
    refetchInterval: 5_000, // Fast polling for responsive stage/hand changes
  });
}

/** Get a specific user's presence in the room */
export function useUserPresence(roomATag: string | undefined, pubkey: string | undefined) {
  const { data: presenceList } = useRoomPresence(roomATag);

  if (!presenceList || !pubkey) return undefined;
  return presenceList.find((e) => e.pubkey === pubkey);
}
