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
  /** The image's `<width>x<height>`, when known. */
  imageDimensions?: string;
  /** Thumbnail URLs with dimensions. Defaults to the image itself. */
  thumbs?: Array<{ url: string; dimensions?: string }>;
}

/**
 * The `image` and `thumb` tags of a badge definition.
 *
 * NIP-58 `thumb` is optional, but some clients only honor it. Like Amethyst,
 * point it at the uploaded image itself so they still show the badge.
 */
export function badgeImageTags(
  imageUrl: string,
  imageDimensions?: string,
  thumbs: Array<{ url: string; dimensions?: string }> = [{ url: imageUrl, dimensions: imageDimensions }],
): string[][] {
  return [
    ['image', imageUrl, ...(imageDimensions ? [imageDimensions] : [])],
    ...thumbs.map((thumb) => ['thumb', thumb.url, ...(thumb.dimensions ? [thumb.dimensions] : [])]),
  ];
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
        tags.push(...badgeImageTags(params.imageUrl, params.imageDimensions, params.thumbs));
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
