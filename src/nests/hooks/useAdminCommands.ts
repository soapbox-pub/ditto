import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNostr } from "@nostrify/react";
import type { NostrEvent } from "@nostrify/nostrify";
import { NESTS_ADMIN_COMMAND_KIND } from "../lib/const";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { isNostrId } from "@/lib/nostrId";

interface UseAdminCommandsOptions {
  /** The room event to monitor commands for */
  roomEvent: NostrEvent | undefined;
  /** Callback when a kick command targeting the current user is received */
  onKick?: () => void;
  /** Room relays to query (in addition to the global pool's defaults). */
  relays?: string[];
}

/**
 * Watch for kind:4312 admin command events targeting the current user.
 * Admin commands must come from the room host or an admin.
 *
 * Consumed by the app-level NestsProvider so kicks land even while the
 * nest is minimized.
 */
export function useAdminCommands({ roomEvent, onKick, relays }: UseAdminCommandsOptions) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const processedRef = useRef(new Set<string>());

  const relaysKey = relays?.join("|") ?? "";
  const pool = useMemo(
    () => (relays && relays.length > 0 ? nostr.group(relays) : nostr),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nostr, relaysKey],
  );

  // Get list of admin pubkeys for validation (malformed p-tag pubkeys are
  // dropped so they can't pollute the `authors` filter)
  const adminPubkeys = useMemo(() => {
    if (!roomEvent) return [];
    return [
      roomEvent.pubkey, // host is always admin
      ...roomEvent.tags
        .filter(([t, pk, , role]) => t === "p" && role === "admin" && isNostrId(pk))
        .map(([, pk]) => pk),
    ];
  }, [roomEvent]);
  const adminsKey = adminPubkeys.join(",");

  const roomATag = roomEvent
    ? `${roomEvent.kind}:${roomEvent.pubkey}:${roomEvent.tags.find(([t]) => t === "d")?.[1] ?? ""}`
    : undefined;

  // Only honor kicks issued after we joined this room; the processed set
  // is reset per room so ids never bleed between sessions.
  const sessionStartRef = useRef(Math.floor(Date.now() / 1000));
  useEffect(() => {
    sessionStartRef.current = Math.floor(Date.now() / 1000);
    processedRef.current = new Set();
  }, [roomATag]);

  const query = useQuery({
    queryKey: ["nests", "admin-commands", roomATag ?? "", user?.pubkey ?? "", adminsKey],
    queryFn: async () => {
      if (!user || !roomATag || adminPubkeys.length === 0) return [];

      const events = await pool.query(
        [{
          kinds: [NESTS_ADMIN_COMMAND_KIND],
          authors: adminPubkeys,
          "#p": [user.pubkey],
          "#a": [roomATag],
          since: sessionStartRef.current - 30,
          limit: 10,
        }],
        { signal: AbortSignal.timeout(3000) },
      );

      return events;
    },
    enabled: !!user && !!roomATag && adminPubkeys.length > 0,
    refetchInterval: 5_000,
  });

  // Process new commands
  useEffect(() => {
    if (!query.data || !user) return;

    for (const event of query.data) {
      if (processedRef.current.has(event.id)) continue;
      processedRef.current.add(event.id);

      const action = event.tags.find(([t]) => t === "action")?.[1];
      if (action === "kick") {
        onKick?.();
      }
    }
  }, [query.data, user, onKick]);
}
