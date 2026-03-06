import { useQueryClient } from '@tanstack/react-query';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { PROFILE_TABS_KIND, buildProfileTabsTags, type ProfileTabsData } from '@/lib/profileTabsEvent';

/**
 * Publish a kind 16769 profile tabs event, replacing any previous one.
 * Pass `{ tabs: [], vars: [] }` to clear all tabs.
 */
export function usePublishProfileTabs() {
  const { user } = useCurrentUser();
  const { mutateAsync: createEvent, isPending } = useNostrPublish();
  const queryClient = useQueryClient();

  const publishProfileTabs = async (data: ProfileTabsData): Promise<void> => {
    if (!user) throw new Error('Must be logged in to publish profile tabs');

    await createEvent({
      kind: PROFILE_TABS_KIND,
      content: '',
      tags: buildProfileTabsTags(data),
    });

    // Invalidate both so ProfilePage refetches fresh data
    await queryClient.invalidateQueries({ queryKey: ['profile-tabs', user.pubkey] });
    await queryClient.invalidateQueries({ queryKey: ['profile-supplementary', user.pubkey] });
  };

  return { publishProfileTabs, isPending };
}
