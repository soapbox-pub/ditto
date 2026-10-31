import { useNostr } from '@nostrify/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import { articleImetaTags, type ArticleFields } from '@/lib/articleHelpers';

/** Kind 31234 — NIP-37 Draft Wrap. */
export const DRAFT_WRAP_KIND = 31234;
/** The inner draft kind we're wrapping. */
const ARTICLE_KIND = 30023;

export interface Draft extends ArticleFields {
  /**
   * Stable identity of the draft: the wrap's `d` tag. Independent of the
   * article's slug, so renaming the slug updates the same draft instead of
   * leaving the old one behind.
   */
  id: string;
  updatedAt: number;
  eventId?: string;
  /** Set when the draft holds unpublished edits to an already-published article (ms). */
  publishedAt?: number;
}

interface SaveDraftInput {
  draftId: string;
  draft: ArticleFields;
  /** `published_at` of the article being edited (ms), if any. */
  publishedAt?: number;
}

/** Build an unsigned kind-30023 event object from draft data. */
function buildInnerDraftEvent(draft: ArticleFields, publishedAt?: number): Record<string, unknown> {
  const tags: string[][] = [
    ['d', draft.slug],
    ['title', draft.title],
  ];

  if (publishedAt) tags.push(['published_at', String(Math.floor(publishedAt / 1000))]);
  if (draft.summary) tags.push(['summary', draft.summary]);
  if (draft.image) tags.push(['image', draft.image]);
  draft.tags.forEach(tag => tags.push(['t', tag]));
  tags.push(...articleImetaTags(draft));

  return {
    kind: ARTICLE_KIND,
    content: draft.content,
    tags,
  };
}

/** Parse a decrypted inner draft event back into a Draft. */
export function parseDraftPayload(inner: Record<string, unknown>, wrapEvent: NostrEvent): Draft {
  const tags = (inner.tags ?? []) as string[][];
  const getTag = (name: string) => tags.find(t => t[0] === name)?.[1] || '';
  const getTags = (name: string) => tags.filter(t => t[0] === name).map(t => t[1]);
  const publishedAt = parseInt(getTag('published_at'));

  return {
    id: wrapEvent.tags.find(([name]) => name === 'd')?.[1] ?? '',
    eventId: wrapEvent.id,
    title: getTag('title'),
    summary: getTag('summary'),
    content: (inner.content as string) || '',
    image: getTag('image'),
    tags: getTags('t'),
    slug: getTag('d'),
    imeta: tags.filter(t => t[0] === 'imeta'),
    updatedAt: wrapEvent.created_at * 1000,
    publishedAt: Number.isFinite(publishedAt) ? publishedAt * 1000 : undefined,
  };
}

export function useDrafts() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();

  // Query and decrypt drafts from relay
  const query = useQuery<Draft[]>({
    queryKey: ['drafts', user?.pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!user?.pubkey || !user.signer.nip44) return [];

      const events = await nostr.query(
        [{ kinds: [DRAFT_WRAP_KIND], authors: [user.pubkey], '#k': [String(ARTICLE_KIND)], limit: 100 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );

      const drafts: Draft[] = [];

      for (const event of events) {
        // Blank content means deleted
        if (!event.content.trim()) continue;

        try {
          const decrypted = await user.signer.nip44.decrypt(user.pubkey, event.content);
          const inner = JSON.parse(decrypted) as Record<string, unknown>;
          const draft = parseDraftPayload(inner, event);
          if (draft.content.trim()) drafts.push(draft);
        } catch {
          // Skip events that fail to decrypt or parse
          continue;
        }
      }

      return drafts.sort((a, b) => b.updatedAt - a.updatedAt);
    },
    enabled: !!user?.pubkey && !!user?.signer.nip44,
    staleTime: 30 * 1000,
  });

  // Save draft: encrypt inner event and publish as kind 31234
  const saveMutation = useMutation({
    mutationFn: async ({ draftId, draft, publishedAt }: SaveDraftInput) => {
      if (!user?.signer.nip44) throw new Error('NIP-44 encryption not supported by signer');

      const inner = buildInnerDraftEvent(draft, publishedAt);
      const plaintext = JSON.stringify(inner);
      const encrypted = await user.signer.nip44.encrypt(user.pubkey, plaintext);

      return publishEvent({
        kind: DRAFT_WRAP_KIND,
        content: encrypted,
        tags: [
          ['d', draftId],
          ['k', String(ARTICLE_KIND)],
        ],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drafts', user?.pubkey] });
    },
  });

  // Delete draft: NIP-37 blanks the wrap's content, replacing it in place.
  const deleteMutation = useMutation({
    mutationFn: async (draftId: string) => {
      if (!user) throw new Error('User is not logged in');

      await publishEvent({
        kind: DRAFT_WRAP_KIND,
        content: '',
        tags: [
          ['d', draftId],
          ['k', String(ARTICLE_KIND)],
        ],
      });
      return draftId;
    },
    onSuccess: (draftId) => {
      queryClient.setQueryData(['drafts', user?.pubkey], (oldData: Draft[] | undefined) => {
        if (!oldData) return [];
        return oldData.filter(d => d.id !== draftId);
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
