import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { BADGE_DEFINITION_KIND } from '@/lib/badgeUtils';

interface CreateBadgeParams {
  /** Badge display name. */
  name: string;
  /** Badge d-tag identifier (slug). */
  identifier: string;
  /** Optional description. */
  description?: string;
  /** Full-size image URL (uploaded via Blossom). */
  imageUrl?: string;
  /** Optional thumbnail URLs with dimensions. */
  thumbs?: Array<{ url: string; dimensions?: string }>;
}

/**
 * Mutation to create a new badge definition (kind 30009).
 */
export function useCreateBadge() {
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CreateBadgeParams) => {
      if (!user) throw new Error('User is not logged in');

      const tags: string[][] = [
        ['d', params.identifier],
        ['name', params.name],
      ];

      if (params.description) {
        tags.push(['description', params.description]);
      }

      if (params.imageUrl) {
        tags.push(['image', params.imageUrl, '1024x1024']);
      }

      if (params.thumbs) {
        for (const thumb of params.thumbs) {
          tags.push(['thumb', thumb.url, ...(thumb.dimensions ? [thumb.dimensions] : [])]);
        }
      }

      return publishEvent({
        kind: BADGE_DEFINITION_KIND,
        content: '',
        tags,
      } as Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['badge-feed'] });
      queryClient.invalidateQueries({ queryKey: ['my-created-badges'] });
    },
  });
}
