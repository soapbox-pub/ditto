import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { BADGE_PROFILE_KIND } from '@/lib/badgeUtils';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';

/**
 * Mutation to remove a badge from the user's profile — removes the `a` + `e`
 * tag pair from the kind 30008 event and republishes.
 *
 * Fetches the freshest event from relays before mutating to avoid overwriting
 * badges accepted on another device or in a rapid sequence.
 *
 * Note: This does NOT reject the badge award. The user can re-accept the
 * badge later since the kind 8 award event still exists.
 */
export function useRemoveBadge() {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();

  return useMutation({
    mutationFn: async (aTag: string) => {
      if (!user) throw new Error('User is not logged in');

      // Fetch the freshest kind 30008 from relays before mutating
      const freshEvent = await fetchFreshEvent(nostr, {
        kinds: [BADGE_PROFILE_KIND],
        authors: [user.pubkey],
        '#d': ['profile_badges'],
      });

      if (!freshEvent) throw new Error('No profile badges event found');

      const tags = freshEvent.tags;
      const newTags: string[][] = [];

      for (let i = 0; i < tags.length; i++) {
        const tag = tags[i];
        if (tag[0] === 'a' && tag[1] === aTag) {
          // Skip this `a` tag and its paired `e` tag
          if (i + 1 < tags.length && tags[i + 1][0] === 'e') {
            i++; // skip the `e` tag too
          }
          continue;
        }
        newTags.push(tag);
      }

      await publishEvent({
        kind: BADGE_PROFILE_KIND,
        content: '',
        tags: newTags,
      } as Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile-badges', user?.pubkey] });
    },
  });
}
