import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useProfileBadges } from '@/hooks/useProfileBadges';
import { BADGE_PROFILE_KIND } from '@/lib/badgeUtils';

/**
 * Mutation to remove a badge from the user's profile — removes the `a` + `e`
 * tag pair from the kind 30008 event and republishes.
 *
 * Note: This does NOT reject the badge award. The user can re-accept the
 * badge later since the kind 8 award event still exists.
 */
export function useRemoveBadge() {
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { event: profileBadgesEvent } = useProfileBadges(user?.pubkey);

  return useMutation({
    mutationFn: async (aTag: string) => {
      if (!user) throw new Error('User is not logged in');
      if (!profileBadgesEvent) throw new Error('No profile badges event found');

      const tags = profileBadgesEvent.tags;
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
