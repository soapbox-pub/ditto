import { useNostr } from '@nostrify/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { DVM_JOB_REQUEST_KIND, DVM_JOB_RESULT_KIND } from '@/lib/badgeUtils';

/**
 * Mutation to claim an achievement badge via the DVM badge bot.
 *
 * Publishes a kind 5950 job request and subscribes to the kind 6950 response.
 * Resolves when the bot responds with success or failure, or rejects on timeout.
 */
export function useClaimAchievement() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();

  return useMutation({
    mutationFn: async ({ badgeATag, adminPubkey }: { badgeATag: string; adminPubkey: string }) => {
      if (!user) throw new Error('User is not logged in');

      // Publish the DVM job request (kind 5950)
      const jobEvent = await publishEvent({
        kind: DVM_JOB_REQUEST_KIND,
        content: '',
        tags: [
          ['i', badgeATag, 'event'],
          ['param', 'action', 'claim-achievement'],
          ['p', adminPubkey],
        ],
      } as Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>);

      // Subscribe and wait for the DVM result (kind 6950)
      return new Promise<{ success: boolean; message: string }>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Achievement claim timed out. Please try again later.'));
        }, 30_000);

        const controller = new AbortController();

        (async () => {
          try {
            for await (const msg of nostr.req(
              [{ kinds: [DVM_JOB_RESULT_KIND], authors: [adminPubkey], '#e': [jobEvent.id], limit: 1 }],
              { signal: controller.signal },
            )) {
              if (msg[0] === 'EVENT') {
                const resultEvent = msg[2] as NostrEvent;
                const status = resultEvent.tags.find(([n]) => n === 'status')?.[1];
                clearTimeout(timeout);
                controller.abort();

                if (status === 'success') {
                  resolve({ success: true, message: resultEvent.content || 'Achievement verified! Badge awarded.' });
                } else {
                  resolve({ success: false, message: resultEvent.content || 'Could not verify achievement.' });
                }
                return;
              }
            }
          } catch (err) {
            if ((err as Error).name !== 'AbortError') {
              clearTimeout(timeout);
              reject(err);
            }
          }
        })();
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['badge-awards-to', user?.pubkey] });
      queryClient.invalidateQueries({ queryKey: ['achievement-progress'] });
    },
  });
}
