import { useMemo } from "react";
import type { NostrEvent } from "@nostrify/nostrify";
import { useCurrentUser } from "@/hooks/useCurrentUser";

/**
 * Check if the current user is host (event author) or admin (p-tag with "admin" role)
 * of the given room event.
 */
export function useIsAdmin(roomEvent: NostrEvent | undefined): {
  isHost: boolean;
  isAdmin: boolean;
  isSpeaker: boolean;
  isHostOrAdmin: boolean;
} {
  const { user } = useCurrentUser();

  return useMemo(() => {
    if (!roomEvent || !user) {
      return { isHost: false, isAdmin: false, isSpeaker: false, isHostOrAdmin: false };
    }

    const pubkey = user.pubkey;
    const isHost = roomEvent.pubkey === pubkey;

    const pTags = roomEvent.tags.filter(([t]) => t === "p");
    const userTag = pTags.find(([, pk]) => pk === pubkey);

    const role = userTag?.[3]; // 4th element is the role marker
    const isAdmin = role === "admin";
    const isSpeaker = role === "speaker" || isAdmin || isHost;

    return {
      isHost,
      isAdmin,
      isSpeaker,
      isHostOrAdmin: isHost || isAdmin,
    };
  }, [roomEvent, user]);
}
