import { useNostr } from "@nostrify/react";
import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { nip19 } from "nostr-tools";

import { useAppContext } from "./useAppContext";
import { useCurrentUser } from "./useCurrentUser";
import { sendToInboxRelays } from "@/lib/inboxRelays";
import {
  classifyPublishedInteraction,
  emitPostInteraction,
} from "@/lib/postInteraction";

import type { NostrEvent } from "@nostrify/nostrify";

/** Event template accepted by `useNostrPublish`. */
export type EventTemplate = Omit<NostrEvent, 'id' | 'pubkey' | 'sig'> & {
  /**
   * The previous version of the event being replaced (for replaceable/addressable kinds).
   * When provided, `published_at` from the old event is preserved on the new one.
   * When omitted and the kind is replaceable or addressable, `published_at` is set
   * equal to `created_at` so the two always match on first publish.
   */
  prev?: NostrEvent;
};

/** Returns true if the kind falls in a replaceable or addressable range. */
function isReplaceableKind(kind: number): boolean {
  // Legacy replaceable kinds
  if (kind === 0 || kind === 3) return true;
  // Replaceable (10000–19999) or addressable (30000–39999)
  return (kind >= 10000 && kind < 20000) || (kind >= 30000 && kind < 40000);
}

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
    mutationFn: async (t: EventTemplate) => {
      if (user) {
        // Extract `prev` before building the event — it's not part of the Nostr event schema.
        const { prev, ...template } = t;
        const tags = [...(template.tags ?? [])];

        // Add the NIP-89 client tag if it doesn't exist
        if (!tags.some(([name]) => name === "client")) {
          const clientTag = buildClientTag(config.clientName ?? config.appName, config.client);
          tags.push(clientTag);
        }

        const created_at = template.created_at ?? Math.floor(Date.now() / 1000);

        // Handle published_at for replaceable/addressable events (NIP-24)
        if (isReplaceableKind(template.kind) && !tags.some(([name]) => name === "published_at")) {
          if (prev) {
            // Preserve published_at from the previous event if it had one
            const oldTag = prev.tags.find(([name]) => name === "published_at");
            if (oldTag) {
              tags.push(["published_at", oldTag[1]]);
            }
          } else {
            // First publish: set published_at equal to created_at
            tags.push(["published_at", String(created_at)]);
          }
        }

        const event = await user.signer.signEvent({
          kind: template.kind,
          content: template.content ?? "",
          tags,
          created_at,
        });

        if (event.pubkey !== user.pubkey) {
          throw new Error(
            "Signed event pubkey does not match the currently selected account. Please check your signer configuration.",
          );
        }

        await nostr.event(event, { signal: AbortSignal.timeout(5000) });

        // Report reactions, reposts, quotes and replies to the shared post
        // interaction signal, now that the publish has actually been accepted.
        //
        // Here rather than at the ~160 call sites because this is the one place
        // that sees every publish in the app, and because "the event went out"
        // is exactly the moment the signal promises. A publish that throws
        // above never reaches this line, so intent is never mistaken for
        // success. `classifyPublishedInteraction` ignores everything that isn't
        // an interaction (including kind 5 deletions, which is how un-reacting
        // and un-reposting work, and kind 10003 bookmark lists, which
        // `useBookmarks` reports itself).
        const interaction = classifyPublishedInteraction(event);
        if (interaction) emitPostInteraction(interaction);

        // NIP-65: For reply events (kind 1 and 1111), also send to the
        // inbox (read) relays of tagged users so they receive the reply.
        // This is fire-and-forget — it must not block the publish flow.
        if (event.kind === 1 || event.kind === 1111) {
          const taggedPubkeys = event.tags
            .filter(([name]) => name === 'p' || name === 'P')
            .map(([, pubkey]) => pubkey)
            .filter(Boolean);

          if (taggedPubkeys.length > 0) {
            sendToInboxRelays(nostr, event, taggedPubkeys).catch(() => {
              // Silently swallow — inbox delivery is best-effort.
            });
          }
        }

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
