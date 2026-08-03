import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { BADGE_PROFILE_KIND, fetchFreshProfileBadges } from '@/lib/badgeUtils';
import { optimisticPatchEventTags, rollbackEvent } from '@/lib/optimisticEvent';

/** Remove an `a`+`e` badge pair (and any legacy `d` tag) from profile-badges tags. */
function removeBadgePair(tags: string[][], aTag: string): string[][] {
  const newTags: string[][] = [];
  for (let i = 0; i < tags.length; i++) {
    const tag = tags[i];
    if (tag[0] === 'd' && tag[1] === 'profile_badges') continue;
    if (tag[0] === 'a' && tag[1] === aTag) {
      if (i + 1 < tags.length && tags[i + 1][0] === 'e') i++;
      continue;
    }
    newTags.push(tag);
  }
  return newTags;
}

/**
 * Mutation to remove a badge from the user's profile — removes the `a` + `e`
 * tag pair and republishes as kind 10008.
 *
 * Fetches the freshest event from relays (checking both kind 10008 and legacy
 * 30008) before mutating to avoid overwriting badges accepted on another device.
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

      // Fetch the freshest profile badges event from relays (both kinds)
      const freshEvent = await fetchFreshProfileBadges(nostr, user.pubkey);

      if (!freshEvent) throw new Error('No profile badges event found');

      const newTags = removeBadgePair(freshEvent.tags, aTag);

      await publishEvent({
        kind: BADGE_PROFILE_KIND,
        content: '',
        tags: newTags,
      } as Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>);
    },
    // Optimistically drop the badge pair so it disappears from the grid.
    onMutate: (aTag: string) => {
      const key = ['profile-badges', user?.pubkey ?? ''];
      const snapshot = optimisticPatchEventTags(queryClient, key, {
        kind: BADGE_PROFILE_KIND,
        pubkey: user?.pubkey ?? '',
        transform: (tags) => removeBadgePair(tags, aTag),
      });
      return { snapshot, key };
    },
    onError: (_err, _aTag, ctx) => {
      if (ctx) rollbackEvent(queryClient, ctx.key, ctx.snapshot);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile-badges', user?.pubkey] });
    },
  });
}
