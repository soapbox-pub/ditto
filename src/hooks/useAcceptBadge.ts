import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { BADGE_PROFILE_KIND, fetchFreshProfileBadges } from '@/lib/badgeUtils';

/**
 * Mutation to accept a badge — adds the `a` + `e` tag pair to the user's
 * profile badges event and publishes the update as kind 10008.
 *
 * Fetches the freshest event from relays (checking both kind 10008 and legacy
 * 30008) before mutating to avoid overwriting badges accepted on another device.
 */
export function useAcceptBadge() {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();

  return useMutation({
    mutationFn: async ({ aTag, awardEventId }: { aTag: string; awardEventId: string }) => {
      if (!user) throw new Error('User is not logged in');

      // Fetch the freshest profile badges event from relays (both kinds)
      const freshEvent = await fetchFreshProfileBadges(nostr, user.pubkey);

      const currentTags = freshEvent?.tags ?? [['d', 'profile_badges']];

      // Don't add duplicates
      const alreadyHas = currentTags.some(
        ([n, v], i) => n === 'a' && v === aTag && currentTags[i + 1]?.[0] === 'e' && currentTags[i + 1]?.[1] === awardEventId,
      );
      if (alreadyHas) return;

      // Strip any legacy `d` tag — kind 10008 is replaceable and doesn't need it
      const withoutDTag = currentTags.filter(([n, v]) => !(n === 'd' && v === 'profile_badges'));

      // Append the new badge pair at the end
      const newTags = [
        ...withoutDTag,
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
    },
  });
}
