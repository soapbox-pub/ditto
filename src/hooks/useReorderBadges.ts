import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { BADGE_PROFILE_KIND } from '@/lib/badgeUtils';

interface BadgeRefForReorder {
  aTag: string;
  eTag?: string;
}

/**
 * Mutation to reorder the user's accepted badges.
 *
 * Republishes the profile badges event as kind 10008 with badge `a` + `e`
 * tag pairs in the new order.
 */
export function useReorderBadges() {
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();

  return useMutation({
    mutationFn: async (orderedRefs: BadgeRefForReorder[]) => {
      if (!user) throw new Error('User is not logged in');

      const newTags: string[][] = [];
      for (const ref of orderedRefs) {
        newTags.push(['a', ref.aTag]);
        if (ref.eTag) {
          newTags.push(['e', ref.eTag]);
        }
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
