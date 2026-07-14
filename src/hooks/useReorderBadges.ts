import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { BADGE_PROFILE_KIND } from '@/lib/badgeUtils';
import { optimisticPatchEventTags, rollbackEvent } from '@/lib/optimisticEvent';

interface BadgeRefForReorder {
  aTag: string;
  eTag?: string;
}

/** Serialize ordered badge refs into `a`+`e` tag pairs. */
function refsToTags(orderedRefs: BadgeRefForReorder[]): string[][] {
  const tags: string[][] = [];
  for (const ref of orderedRefs) {
    tags.push(['a', ref.aTag]);
    if (ref.eTag) tags.push(['e', ref.eTag]);
  }
  return tags;
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

      await publishEvent({
        kind: BADGE_PROFILE_KIND,
        content: '',
        tags: refsToTags(orderedRefs),
      } as Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>);
    },
    // Optimistically apply the new order so the grid reorders instantly.
    onMutate: (orderedRefs: BadgeRefForReorder[]) => {
      const key = ['profile-badges', user?.pubkey ?? ''];
      const snapshot = optimisticPatchEventTags(queryClient, key, {
        kind: BADGE_PROFILE_KIND,
        pubkey: user?.pubkey ?? '',
        transform: () => refsToTags(orderedRefs),
      });
      return { snapshot, key };
    },
    onError: (_err, _refs, ctx) => {
      if (ctx) rollbackEvent(queryClient, ctx.key, ctx.snapshot);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile-badges', user?.pubkey] });
    },
  });
}
