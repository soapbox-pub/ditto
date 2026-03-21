import { useMutation } from '@tanstack/react-query';
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
  /** Optional price in sats (makes it a shop badge). */
  price?: number;
  /** Optional supply cap (limited edition). */
  supply?: number;
  /** Optional category tags. */
  categories?: string[];
}

/**
 * Mutation to create a new badge definition (kind 30009).
 */
export function useCreateBadge() {
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();

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

      if (params.price !== undefined) {
        tags.push(['price', params.price.toString()]);
        tags.push(['t', 'shop']);
      }

      if (params.supply !== undefined) {
        tags.push(['supply', params.supply.toString()]);
      }

      if (params.categories) {
        for (const cat of params.categories) {
          tags.push(['t', cat]);
        }
      }

      return publishEvent({
        kind: BADGE_DEFINITION_KIND,
        content: '',
        tags,
      } as Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>);
    },
  });
}
