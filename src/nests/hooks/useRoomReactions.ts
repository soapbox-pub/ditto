import { useQuery } from "@tanstack/react-query";
import type { NostrEvent } from "@nostrify/nostrify";
import { useRoomNostr } from "./useRoomNostr";

/**
 * Query reactions (kind:7) and zap receipts (kind:9735) for a room.
 */
export function useRoomReactions(roomATag: string | undefined) {
  const { nostr } = useRoomNostr();

  return useQuery({
    queryKey: ["nests", "room-reactions", roomATag ?? ""],
    queryFn: async () => {
      if (!roomATag) return [];

      const events = await nostr.query(
        [{ kinds: [7, 9735], "#a": [roomATag], limit: 200 }],
        { signal: AbortSignal.timeout(3000) },
      );

      // Sort by created_at descending
      return events.sort((a, b) => b.created_at - a.created_at);
    },
    enabled: !!roomATag,
    refetchInterval: 3_000, // Fast polling for near-realtime reactions
  });
}

/** Filter reactions by a specific user */
export function useUserReactions(roomATag: string | undefined, pubkey: string | undefined) {
  const { data: reactions } = useRoomReactions(roomATag);

  if (!reactions || !pubkey) return [];
  return reactions.filter((e: NostrEvent) => e.pubkey === pubkey);
}
