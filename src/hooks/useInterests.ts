import { useNostr } from '@nostrify/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import type { NostrEvent } from '@nostrify/nostrify';

/** Hook to manage the user's NIP-51 kind 10015 interests list. */
export function useInterests() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();

  const interestsQuery = useQuery({
    queryKey: ['interests', user?.pubkey],
    queryFn: async () => {
      if (!user) return null;
      const events = await nostr.query([{
        kinds: [10015],
        authors: [user.pubkey],
        limit: 1,
      }]);
      // Kind 10015 is replaceable — take the newest
      return events.length > 0
        ? events.reduce((latest, ev) => ev.created_at > latest.created_at ? ev : latest)
        : null;
    },
    enabled: !!user,
  });

  const event = interestsQuery.data ?? null;

  /** The user's interest hashtags, in order. */
  const hashtags: string[] = event
    ? event.tags.filter(([n]) => n === 't').map(([, v]) => v)
    : [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['interests', user?.pubkey] });
  };

  /** Republish the interests event with updated tags. */
  async function republish(newTags: string[][]) {
    if (!user) throw new Error('User is not logged in');
    return publishEvent({
      kind: 10015,
      content: event?.content ?? '',
      tags: newTags,
    } as Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>);
  }

  const addInterest = useMutation({
    mutationFn: async (tag: string) => {
      const normalized = tag.toLowerCase().replace(/^#/, '');
      if (!normalized) throw new Error('Tag cannot be empty');
      // Don't add duplicates
      if (hashtags.includes(normalized)) return event;
      const currentTags = event?.tags ?? [];
      return republish([...currentTags, ['t', normalized]]);
    },
    onSuccess: invalidate,
  });

  const removeInterest = useMutation({
    mutationFn: async (tag: string) => {
      const normalized = tag.toLowerCase().replace(/^#/, '');
      if (!event) throw new Error('No interests event found');
      const newTags = event.tags.filter(
        ([name, value]) => !(name === 't' && value === normalized),
      );
      return republish(newTags);
    },
    onSuccess: invalidate,
  });

  /** Check if a hashtag is in the user's interests. */
  function hasInterest(tag: string): boolean {
    return hashtags.includes(tag.toLowerCase().replace(/^#/, ''));
  }

  return {
    hashtags,
    isLoading: interestsQuery.isLoading,
    addInterest,
    removeInterest,
    hasInterest,
  };
}
