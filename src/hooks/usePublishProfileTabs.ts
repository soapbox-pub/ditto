import { useQueryClient } from '@tanstack/react-query';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { PROFILE_TABS_KIND, buildProfileTabsTags, type ProfileTab } from '@/lib/profileTabsEvent';

/**
 * Publish a kind 16769 profile tabs event, replacing any previous one.
 * Pass an empty array to clear all tabs.
 */
export function usePublishProfileTabs() {
  const { user } = useCurrentUser();
  const { mutateAsync: createEvent, isPending } = useNostrPublish();
  const queryClient = useQueryClient();

  const publishProfileTabs = async (tabs: ProfileTab[]): Promise<void> => {
    if (!user) throw new Error('Must be logged in to publish profile tabs');

    await createEvent({
      kind: PROFILE_TABS_KIND,
      content: '',
      tags: buildProfileTabsTags(tabs),
    });

    // Invalidate both so ProfilePage refetches fresh data
    await queryClient.invalidateQueries({ queryKey: ['profile-tabs', user.pubkey] });
    await queryClient.invalidateQueries({ queryKey: ['profile-supplementary', user.pubkey] });
  };

  return { publishProfileTabs, isPending };
}
