import { useEffect, useState } from 'react';
import { useSearchParams, useParams } from 'react-router-dom';
import { useNostr } from '@nostrify/react';
import { Loader2 } from 'lucide-react';

import type { NostrFilter } from '@nostrify/nostrify';

import { ArticleEditor, type ArticleEditorInitialData } from '@/components/articles/ArticleEditor';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { DRAFT_WRAP_KIND, parseDraftPayload, type Draft } from '@/hooks/useDrafts';
import { getLocalDrafts } from '@/lib/localDrafts';
import { parseArticleEvent } from '@/lib/articleHelpers';
import { isNostrId } from '@/lib/nostrId';

/** Thin page wrapper for /articles/new and /articles/edit/:slug */
export function ArticleEditorPage() {
  useLayoutOptions({ showFAB: false, hasSubHeader: true });

  const [searchParams] = useSearchParams();
  const { slug: editSlug } = useParams<{ slug: string }>();
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  const draftSlug = searchParams.get('draft');

  const [initialData, setInitialData] = useState<ArticleEditorInitialData | undefined>(undefined);
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(!!editSlug || !!draftSlug);

  // Reset state whenever the route target changes so navigating between
  // /articles/new and /articles/edit/:slug (or between two articles) doesn't
  // leave stale data from the previous target on screen.
  useEffect(() => {
    setInitialData(undefined);
    setEditMode(false);
    setLoading(!!editSlug || !!draftSlug);
  }, [editSlug, draftSlug]);

  // Load draft ?draft=<id> from relay (NIP-37 kind 31234, encrypted) and
  // localStorage, preferring whichever copy is newer. Auto-saves only go to
  // localStorage, so the local copy is often ahead of the relay one.
  useEffect(() => {
    if (!draftSlug) return;

    const loadDraft = async () => {
      let relayDraft: Draft | undefined;
      if (user?.signer.nip44) {
        try {
          const filters: NostrFilter[] = [
            { kinds: [DRAFT_WRAP_KIND], authors: [user.pubkey], '#d': [draftSlug], limit: 1 },
          ];
          // Drafts with an empty `d` tag are linked by event id.
          if (isNostrId(draftSlug)) {
            filters.push({ kinds: [DRAFT_WRAP_KIND], authors: [user.pubkey], ids: [draftSlug], limit: 1 });
          }
          const [event] = (await nostr.query(filters)).sort((a, b) => b.created_at - a.created_at);
          if (event?.content.trim()) {
            const decrypted = await user.signer.nip44.decrypt(user.pubkey, event.content);
            relayDraft = parseDraftPayload(JSON.parse(decrypted) as Record<string, unknown>, event);
          }
        } catch {
          // Fall through to localStorage
        }
      }

      // Legacy local drafts were keyed by slug, so match by slug as a fallback.
      const drafts = getLocalDrafts();
      const localDraft = drafts.find((d) => d.id === draftSlug)
        ?? drafts.find((d) => d.slug === draftSlug)
        ?? (relayDraft && drafts.find((d) => d.id === relayDraft.id));

      const draft = relayDraft && localDraft
        ? (localDraft.updatedAt > relayDraft.updatedAt ? { ...localDraft, id: relayDraft.id } : relayDraft)
        : relayDraft ?? localDraft;

      if (draft) {
        setInitialData({
          title: draft.title,
          summary: draft.summary,
          content: draft.content,
          image: draft.image,
          tags: draft.tags,
          slug: draft.slug,
          imeta: draft.imeta,
          draftId: draft.id,
          publishedAt: draft.publishedAt,
        });
        // A draft of edits to a published article keeps updating that article.
        setEditMode(!!draft.publishedAt && !!draft.slug);
      }
      setLoading(false);
    };

    loadDraft();
  }, [draftSlug, user, nostr]);

  // Load an existing published article for editing if /articles/edit/:slug.
  // The slug is the article's `d` tag. Editing is restricted to the logged-in
  // user's own articles, so the author is implicitly the current user.
  useEffect(() => {
    if (!editSlug) return;

    if (!user) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    nostr
      .query([
        {
          kinds: [30023],
          authors: [user.pubkey],
          '#d': [editSlug],
          limit: 1,
        },
      ])
      .then((events) => {
        if (cancelled) return;
        if (events.length > 0) {
          setInitialData(parseArticleEvent(events[0]));
          setEditMode(true);
        }
      })
      .catch((err) => {
        console.error('Failed to load article for editing:', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [editSlug, nostr, user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Key on the route target so the editor fully remounts (resetting all its
  // internal state) when navigating between new / edit / a different article.
  return <ArticleEditor key={editSlug ?? draftSlug ?? 'new'} initialData={initialData} editMode={editMode} />;
}
