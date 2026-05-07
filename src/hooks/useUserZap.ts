import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { extractZapSender } from '@/hooks/useEventInteractions';

/**
 * Returns true when the current user has already zapped the given event on
 * either rail -- NIP-57 Lightning (kind 9735) or on-chain Bitcoin (Ditto's
 * kind 8333, see `NIP.md`).
 *
 * Used by the action-bar zap button to render a "filled" state after a
 * successful send, mirroring the `useUserReaction` / `isReposted` pattern.
 *
 * Returns `undefined` while loading, `false` if no zap from this user is
 * known, `true` if at least one zap is confirmed. The two rails are queried
 * together as a single REQ so every NoteCard adds at most one round-trip.
 *
 * Caching strategy mirrors `useUserReaction`: the mutation side
 * (`useOnchainZap`, `useZaps`) optimistically sets the cache to `true` so
 * the icon fills immediately on success without waiting for the relay to
 * echo the event back. The cache key intentionally omits the user pubkey
 * because it is invalidated on login / logout elsewhere; re-fetching under
 * a stale pubkey would be caught by the `enabled` guard.
 */
export function useUserZap(eventId: string | undefined): boolean | undefined {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  // Optimistic-cache fast path. If the send hooks have marked this event as
  // zapped, skip the REQ and return true immediately.
  const cached = queryClient.getQueryData<boolean>(['user-zap', eventId ?? '']);

  const { data } = useQuery({
    queryKey: ['user-zap', eventId ?? ''],
    queryFn: async ({ signal }): Promise<boolean> => {
      if (!eventId || !user) return false;

      const timeout = AbortSignal.timeout(5000);
      const combined = AbortSignal.any([signal, timeout]);

      // Two filters in one REQ:
      //   - 8333 is authored by the sender, so `authors` is a cheap exact match.
      //   - 9735 is authored by the LNURL server, so we must pull by `#e` and
      //     match the sender client-side via extractZapSender (P tag / zap
      //     request pubkey).
      const events = await nostr.query(
        [
          { kinds: [8333], authors: [user.pubkey], '#e': [eventId], limit: 1 },
          { kinds: [9735], '#e': [eventId], limit: 50 },
        ],
        { signal: combined },
      );

      for (const e of events) {
        if (e.kind === 8333) return true;
        if (e.kind === 9735 && extractZapSender(e) === user.pubkey) return true;
      }
      return false;
    },
    enabled: !!eventId && !!user && cached === undefined,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  if (cached !== undefined) return cached;
  return data;
}
