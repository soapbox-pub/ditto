/**
 * useInterests
 *
 * Hook for managing NIP-51 Interests (kind 10015).
 * A replaceable event containing `t` tags for hashtags the user is interested in.
 */
import { useNostr } from '@nostrify/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import type { NostrEvent } from '@nostrify/nostrify';

export function useInterests(tagName: 't' | 'g' = 't') {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();

  const interestsQuery = useQuery({
    queryKey: ['interests', user?.pubkey],
    queryFn: async ({ signal }) => {
      if (!user) return null;
      const events = await nostr.query(
        [{ kinds: [10015], authors: [user.pubkey], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );
      // Kind 10015 is replaceable — only the latest event matters
      return events.length > 0
        ? events.reduce((a, b) => (a.created_at > b.created_at ? a : b))
        : null;
    },
    enabled: !!user,
    staleTime: 60 * 1000,
  });

  /** All interests for this tag type, normalized to lowercase. */
  const hashtags: string[] = (interestsQuery.data?.tags ?? [])
    .filter(([name]) => name === tagName)
    .map(([, value]) => value.toLowerCase())
    .filter((v, i, arr) => arr.indexOf(v) === i); // deduplicate

  /** Check if the user follows a specific interest. */
  function hasInterest(tag: string): boolean {
    return hashtags.includes(tag.toLowerCase());
  }

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['interests', user?.pubkey] });
  };

  /** Add an interest. */
  const addInterest = useMutation({
    mutationFn: async (tag: string) => {
      if (!user) throw new Error('Must be logged in');
      const normalized = tag.toLowerCase().replace(/^#/, '');
      if (!normalized) throw new Error('Empty tag');

      const existing = interestsQuery.data;
      const currentTags = existing?.tags ?? [];

      // Don't add duplicates
      if (currentTags.some(([n, v]) => n === tagName && v.toLowerCase() === normalized)) return;

      const newTags = [...currentTags, [tagName, normalized]];
      await publishEvent({
        kind: 10015,
        content: existing?.content ?? '',
        tags: newTags,
      } as Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>);
    },
    onSuccess: invalidate,
  });

  /** Remove an interest. */
  const removeInterest = useMutation({
    mutationFn: async (tag: string) => {
      if (!user) throw new Error('Must be logged in');
      const normalized = tag.toLowerCase().replace(/^#/, '');

      const existing = interestsQuery.data;
      if (!existing) return;

      const newTags = existing.tags.filter(
        ([name, value]) => !(name === tagName && value.toLowerCase() === normalized),
      );
      await publishEvent({
        kind: 10015,
        content: existing.content ?? '',
        tags: newTags,
      } as Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>);
    },
    onSuccess: invalidate,
  });

  return {
    hashtags,
    hasInterest,
    addInterest,
    removeInterest,
    isLoading: interestsQuery.isLoading,
  };
}
