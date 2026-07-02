import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';

import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import type { UserStatus } from '@/hooks/useUserStatus';

interface PublishStatusParams {
  /** The status text. Empty string clears the status. */
  status: string;
  /** Optional URL to link from the status. */
  url?: string;
}

/**
 * Publish or clear the current user's NIP-38 general status (kind 30315).
 *
 * Publishes an addressable event with d="general". An empty content string
 * signals that the status is cleared.
 */
export function usePublishStatus() {
  const queryClient = useQueryClient();
  const { nostr } = useNostr();
  const { mutateAsync: createEvent } = useNostrPublish();
  const { user } = useCurrentUser();

  return useMutation({
    mutationFn: async ({ status, url }: PublishStatusParams) => {
      if (!user?.pubkey) return;

      // Fetch the previous event to preserve published_at (addressable event convention)
      const prev = await fetchFreshEvent(nostr, {
        kinds: [30315],
        authors: [user.pubkey],
        '#d': ['general'],
      });

      const tags: string[][] = [['d', 'general']];
      if (url) tags.push(['r', url]);

      await createEvent({
        kind: 30315,
        content: status,
        tags,
        prev: prev ?? undefined,
      });
    },
    // Optimistically update the status text/URL so it appears immediately.
    onMutate: ({ status, url }: PublishStatusParams) => {
      if (!user?.pubkey) return undefined;
      const key = ['user-status', user.pubkey];
      const snapshot = queryClient.getQueryData<UserStatus>(key);
      const trimmed = status.trim();
      queryClient.setQueryData<UserStatus>(key, {
        status: trimmed ? trimmed : null,
        url: trimmed ? (sanitizeUrl(url) ?? null) : null,
      });
      return { snapshot, key };
    },
    onError: (_err, _params, ctx) => {
      if (ctx) queryClient.setQueryData(ctx.key, ctx.snapshot);
    },
    onSuccess: () => {
      if (user) {
        queryClient.invalidateQueries({ queryKey: ['user-status', user.pubkey] });
      }
    },
  });
}
