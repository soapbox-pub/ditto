import { useNostr } from "@nostrify/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { NostrEvent } from "@nostrify/nostrify";
import { useCurrentUser } from "@/hooks/useCurrentUser";

interface ModifyEventInput extends Omit<NostrEvent, "id" | "pubkey" | "sig"> {
  /** Room relays to route the publish through. */
  relays?: string[];
}

/**
 * Re-sign and re-publish a modified Nostr event (room edits, role changes).
 * Publishes in the background and invalidates nest queries so the UI
 * refreshes quickly.
 */
export function useEventModifier() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ModifyEventInput) => {
      if (!user) throw new Error("User is not logged in");

      const { relays, ...event } = input;

      const signed = await user.signer.signEvent({
        kind: event.kind,
        content: event.content,
        tags: event.tags,
        created_at: Math.floor(Date.now() / 1000),
      });

      const pool = relays && relays.length > 0 ? nostr.group(relays) : nostr;
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
