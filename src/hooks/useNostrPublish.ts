import { useNostr } from "@nostrify/react";
import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { nip19 } from "nostr-tools";

import { useAppContext } from "./useAppContext";
import { useCurrentUser } from "./useCurrentUser";

import type { NostrEvent } from "@nostrify/nostrify";

/**
 * Builds a NIP-89 "client" tag from the app display name and an optional
 * `naddr1` identifier for the kind 31990 handler event.
 *
 * Tag format (per NIP-89):
 *   ["client", <name>, <31990:pubkey:d-tag>, <relay-hint>]
 *
 * The relay hint is taken from the first relay embedded in the naddr (if any).
 */
function buildClientTag(name: string, clientNaddr: string | undefined): string[] {
  if (!clientNaddr) {
    return ["client", name];
  }

  try {
    const decoded = nip19.decode(clientNaddr);
    if (decoded.type !== "naddr") {
      return ["client", name];
    }
    const { kind, pubkey, identifier, relays } = decoded.data;
    const addr = `${kind}:${pubkey}:${identifier}`;
    const relayHint = relays?.[0];
    return relayHint ? ["client", name, addr, relayHint] : ["client", name, addr];
  } catch {
    return ["client", name];
  }
}

export function useNostrPublish(): UseMutationResult<NostrEvent> {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config } = useAppContext();

  return useMutation({
    mutationFn: async (t: Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>) => {
      if (user) {
        const tags = t.tags ?? [];

        // Add the NIP-89 client tag if it doesn't exist
        if (location.protocol === "https:" && !tags.some(([name]) => name === "client")) {
          const clientTag = buildClientTag(config.clientName ?? config.appName, config.client);
          tags.push(clientTag);
        }

        const event = await user.signer.signEvent({
          kind: t.kind,
          content: t.content ?? "",
          tags,
          created_at: t.created_at ?? Math.floor(Date.now() / 1000),
        });

        if (event.pubkey !== user.pubkey) {
          throw new Error(
            "Signed event pubkey does not match the currently selected account. Please check your signer configuration.",
          );
        }

        await nostr.event(event, { signal: AbortSignal.timeout(5000) });
        return event;
      } else {
        throw new Error("User is not logged in");
      }
    },
    onError: (error) => {
      console.error("Failed to publish event:", error);
    },
    onSuccess: (data) => {
      console.log("Event published successfully:", data);
    },
  });
}
