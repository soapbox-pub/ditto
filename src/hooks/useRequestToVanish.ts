import { useNostr } from '@nostrify/react';
import { useMutation } from '@tanstack/react-query';

import { useAppContext } from './useAppContext';
import { useCurrentUser } from './useCurrentUser';

/**
 * Hook to publish a NIP-62 Request to Vanish (kind 62) event.
 *
 * - Targeted: sends to specific relays listed in `relay` tags.
 * - Global: sends to ALL_RELAYS and broadcasts to as many relays as possible.
 *
 * After publishing, the user should be logged out since the identity is being erased.
 */
export function useRequestToVanish() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config } = useAppContext();

  return useMutation({
    mutationFn: async ({ relayUrls, content }: { relayUrls: string[]; content: string }) => {
      if (!user) throw new Error('User is not logged in');

      const isGlobal = relayUrls.includes('ALL_RELAYS');

      const tags: string[][] = relayUrls.map((url) => ['relay', url]);

      const event = await user.signer.signEvent({
        kind: 62,
        content,
        tags,
        created_at: Math.floor(Date.now() / 1000),
      });

      if (isGlobal) {
        // For global vanish, broadcast to as many relays as possible.
        // Send to the user's configured relays via the default pool.
        await nostr.event(event, { signal: AbortSignal.timeout(10_000) });

        // Also send directly to each configured relay individually for redundancy.
        const relaySet = new Set(
          config.relayMetadata.relays.map((r) => r.url),
        );
        const directSends = [...relaySet].map((url) =>
          nostr.relay(url).event(event, { signal: AbortSignal.timeout(10_000) }).catch(() => {
            // Swallow individual relay errors — best-effort delivery.
          }),
        );
        await Promise.allSettled(directSends);
      } else {
        // For targeted vanish, send to each specified relay.
        const sends = relayUrls.map((url) =>
          nostr.relay(url).event(event, { signal: AbortSignal.timeout(10_000) }).catch(() => {
            // Swallow individual relay errors — best-effort delivery.
          }),
        );
        await Promise.allSettled(sends);
      }

      return event;
    },
  });
}
