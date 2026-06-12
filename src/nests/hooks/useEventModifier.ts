import { useNostr } from "@nostrify/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { NostrEvent } from "@nostrify/nostrify";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { fetchFreshEvent } from "@/lib/fetchFreshEvent";

interface ModifyEventInput {
  /** The known version of the addressable event being modified. */
  baseEvent: NostrEvent;
  /**
   * Pure transformation applied to the freshest version's tags.
   * Receives a copy — mutate or rebuild freely.
   */
  transformTags: (tags: string[][]) => string[][];
  /** Room relays to route the fetch + publish through. */
  relays?: string[];
}

/**
 * Modify and republish an addressable Nostr event (room edits, role changes)
 * with a read-modify-write cycle: the freshest version is fetched from
 * relays before the transformation is applied, so concurrent edits from
 * another admin or device aren't clobbered by a stale base.
 */
export function useEventModifier() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ baseEvent, transformTags, relays }: ModifyEventInput) => {
      if (!user) throw new Error("User is not logged in");

      const pool = relays && relays.length > 0 ? nostr.group(relays) : nostr;
      const dTag = baseEvent.tags.find(([t]) => t === "d")?.[1] ?? "";

      // Read-modify-write: fetch the freshest version before transforming.
      let fresh: NostrEvent | null = null;
      try {
        fresh = await fetchFreshEvent(pool, {
          kinds: [baseEvent.kind],
          authors: [baseEvent.pubkey],
          "#d": [dTag],
        });
      } catch {
        // Relay miss — fall back to the version we already have
      }
      const base = fresh && fresh.created_at > baseEvent.created_at ? fresh : baseEvent;

      const signed = await user.signer.signEvent({
        kind: base.kind,
        content: base.content,
        tags: transformTags(base.tags.map((tag) => [...tag])),
        created_at: Math.floor(Date.now() / 1000),
      });

      await pool.event(signed, { signal: AbortSignal.timeout(10000) });

      return signed;
    },
    onSuccess: () => {
      // Refresh the session room event, lobby list, and presence promptly
      queryClient.invalidateQueries({ queryKey: ["nests"] });
      queryClient.invalidateQueries({ queryKey: ["addr-event"] });
    },
    onError: (error) => {
      console.error("Failed to modify event:", error);
    },
  });
}
