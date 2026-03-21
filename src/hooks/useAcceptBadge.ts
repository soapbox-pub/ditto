import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useProfileBadges } from '@/hooks/useProfileBadges';
import { BADGE_PROFILE_KIND } from '@/lib/badgeUtils';

/**
 * Mutation to accept a badge — adds the `a` + `e` tag pair to the user's
 * kind 30008 profile_badges event and publishes the update.
 */
export function useAcceptBadge() {
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { event: profileBadgesEvent } = useProfileBadges(user?.pubkey);

  return useMutation({
    mutationFn: async ({ aTag, awardEventId }: { aTag: string; awardEventId: string }) => {
      if (!user) throw new Error('User is not logged in');

      const currentTags = profileBadgesEvent?.tags ?? [['d', 'profile_badges']];

      // Don't add duplicates
      const alreadyHas = currentTags.some(
        ([n, v], i) => n === 'a' && v === aTag && currentTags[i + 1]?.[0] === 'e' && currentTags[i + 1]?.[1] === awardEventId,
      );
      if (alreadyHas) return;

      // Ensure the d tag is present
      const hasDTag = currentTags.some(([n, v]) => n === 'd' && v === 'profile_badges');
      const baseTags = hasDTag ? currentTags : [['d', 'profile_badges'], ...currentTags];

      // Append the new badge pair at the end
      const newTags = [
        ...baseTags,
        ['a', aTag],
        ['e', awardEventId],
      ];

      await publishEvent({
        kind: BADGE_PROFILE_KIND,
        content: '',
        tags: newTags,
      } as Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile-badges', user?.pubkey] });
      queryClient.invalidateQueries({ queryKey: ['badge-awards-to', user?.pubkey] });
    },
  });
}
