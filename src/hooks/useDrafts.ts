import { useNostr } from '@nostrify/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from './useCurrentUser';

export interface Draft {
  id: string;
  title: string;
  summary: string;
  content: string;
  image: string;
  tags: string[];
  slug: string;
  updatedAt: number;
  eventId?: string; // The nostr event id if saved to relay
}

interface DraftData {
  title: string;
  summary: string;
  content: string;
  image: string;
  tags: string[];
  slug: string;
}

function eventToDraft(event: NostrEvent): Draft {
  const getTag = (name: string) => event.tags.find(t => t[0] === name)?.[1] || '';
  const getTags = (name: string) => event.tags.filter(t => t[0] === name).map(t => t[1]);

  return {
    id: event.id,
    eventId: event.id,
    title: getTag('title'),
    summary: getTag('summary'),
    content: event.content,
    image: getTag('image'),
    tags: getTags('t'),
    slug: getTag('d'),
    updatedAt: event.created_at * 1000,
  };
}

export function useDrafts() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  // Query drafts from relay
  const query = useQuery<Draft[]>({
    queryKey: ['drafts', user?.pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!user?.pubkey) {
        return [];
      }

      const events = await nostr.query(
        [{ kinds: [30024], authors: [user.pubkey] }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );

      // Filter out deleted/empty drafts and convert to Draft objects
      return events
        .filter(e => e.content.trim().length > 0)
        .map(eventToDraft)
        .sort((a, b) => b.updatedAt - a.updatedAt);
    },
    enabled: !!user?.pubkey,
    staleTime: 30 * 1000, // 30 seconds
  });

  // Save draft to relay
  const saveMutation = useMutation({
    mutationFn: async (draft: DraftData) => {
      if (!user) {
        throw new Error('User is not logged in');
      }

      const tags: string[][] = [
        ['d', draft.slug],
        ['title', draft.title],
      ];

      if (draft.summary) {
        tags.push(['summary', draft.summary]);
      }

      if (draft.image) {
        tags.push(['image', draft.image]);
      }

      draft.tags.forEach(tag => {
        tags.push(['t', tag]);
      });

      // Add client tag
      if (location.protocol === 'https:') {
        tags.push(['client', location.hostname]);
      }

      const event = await user.signer.signEvent({
        kind: 30024,
        content: draft.content,
        tags,
        created_at: Math.floor(Date.now() / 1000),
      });

      await nostr.event(event, { signal: AbortSignal.timeout(5000) });
      return event;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drafts', user?.pubkey] });
    },
  });

  // Delete draft from relay (publish kind 5 deletion event)
  const deleteMutation = useMutation({
    mutationFn: async (slug: string) => {
      if (!user) {
        throw new Error('User is not logged in');
      }

      // Find the draft event to get its id (optional - we can delete by 'a' tag alone)
      const drafts = query.data || [];
      const draft = drafts.find(d => d.slug === slug);

      // Build deletion tags - always include 'a' tag for addressable events
      const tags: string[][] = [
        ['a', `30024:${user.pubkey}:${slug}`],
      ];

      // Also include 'e' tag if we know the specific event id
      if (draft?.eventId) {
        tags.push(['e', draft.eventId]);
      }

      // Publish a kind 5 deletion event
      const event = await user.signer.signEvent({
        kind: 5,
        content: '',
        tags,
        created_at: Math.floor(Date.now() / 1000),
      });

      await nostr.event(event, { signal: AbortSignal.timeout(5000) });
      return { event, slug };
    },
    onSuccess: (data) => {
      // Optimistically remove the draft from the cache immediately
      queryClient.setQueryData(['drafts', user?.pubkey], (oldData: Draft[] | undefined) => {
        if (!oldData) return [];
        return oldData.filter(d => d.slug !== data?.slug);
      });
    },
  });

  return {
    drafts: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    saveDraft: saveMutation.mutateAsync,
    isSaving: saveMutation.isPending,
    deleteDraft: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  };
}
