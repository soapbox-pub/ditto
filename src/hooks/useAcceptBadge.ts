import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { BADGE_PROFILE_KIND, fetchFreshProfileBadges } from '@/lib/badgeUtils';
import { optimisticPatchEventTags, rollbackEvent } from '@/lib/optimisticEvent';

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
      const prev = await fetchFreshProfileBadges(nostr, user.pubkey);

      const currentTags = prev?.tags ?? [['d', 'profile_badges']];

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
        prev: prev ?? undefined,
      });
    },
    // Optimistically append the badge pair so it shows in the profile grid
    // immediately. Snapshot for rollback on error.
    onMutate: ({ aTag, awardEventId }: { aTag: string; awardEventId: string }) => {
      const key = ['profile-badges', user?.pubkey ?? ''];
      const snapshot = optimisticPatchEventTags(queryClient, key, {
        kind: BADGE_PROFILE_KIND,
        pubkey: user?.pubkey ?? '',
        transform: (tags) => {
          const alreadyHas = tags.some(
            ([n, v], i) => n === 'a' && v === aTag && tags[i + 1]?.[0] === 'e' && tags[i + 1]?.[1] === awardEventId,
          );
          if (alreadyHas) return tags;
          const withoutDTag = tags.filter(([n, v]) => !(n === 'd' && v === 'profile_badges'));
          return [...withoutDTag, ['a', aTag], ['e', awardEventId]];
        },
      });
      return { snapshot, key };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx) rollbackEvent(queryClient, ctx.key, ctx.snapshot);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile-badges', user?.pubkey] });
    },
  });
}
