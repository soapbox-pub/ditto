import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import { useNostrPublish } from '@/hooks/useNostrPublish';
import { buildHighlightTags, type HighlightSource } from '@/lib/highlightSource';
import type { NostrEvent } from '@nostrify/nostrify';

interface CreateHighlightParams {
  /** The highlighted excerpt (goes in `content`). */
  text: string;
  /** Surrounding prose containing the highlight verbatim, attached as a `context` tag. */
  context?: string;
  /** The source event being highlighted. */
  source: HighlightSource;
  /** Optional commentary appended as an extra `comment` tag (NIP-84). */
  comment?: string;
}

/**
 * Publishes a NIP-84 (kind 9802) Highlight event referencing the source event a
 * selection came from. The highlighted text becomes the event `content`; the
 * source, author attribution, and surrounding context are encoded as tags.
 */
export function useCreateHighlight(): UseMutationResult<NostrEvent, Error, CreateHighlightParams> {
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation<NostrEvent, Error, CreateHighlightParams>({
    mutationFn: async ({ text, context, source, comment }) => {
      const tags = buildHighlightTags(source, context);

      const trimmedComment = comment?.trim();
      if (trimmedComment) {
        tags.push(['comment', trimmedComment]);
      }

      return publishEvent({
        kind: 9802,
        content: text,
        tags,
      });
    },
    onSuccess: (_event, { source }) => {
      // Refresh anything keyed off the source event (e.g. highlight counts).
      queryClient.invalidateQueries({ queryKey: ['nostr', 'highlights', source.id] });
    },
  });
}
