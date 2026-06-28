import { useEffect, useState } from 'react';
import { useSearchParams, useParams } from 'react-router-dom';
import { useNostr } from '@nostrify/react';
import { Loader2 } from 'lucide-react';

import { ArticleEditor, type ArticleData } from '@/components/articles/ArticleEditor';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { getLocalDrafts } from '@/lib/localDrafts';
import { parseArticleEvent } from '@/lib/articleHelpers';

/** Thin page wrapper for /articles/new and /articles/edit/:slug */
export function ArticleEditorPage() {
  useLayoutOptions({ showFAB: false, hasSubHeader: true });

  const [searchParams] = useSearchParams();
  const { slug: editSlug } = useParams<{ slug: string }>();
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  const draftSlug = searchParams.get('draft');

  const [initialData, setInitialData] = useState<(Partial<ArticleData> & { publishedAt?: number }) | undefined>(undefined);
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

  // Load draft from relay (NIP-37 kind 31234, encrypted) or localStorage if ?draft=<slug>
  useEffect(() => {
    if (!draftSlug) return;

    const loadDraft = async () => {
      if (user?.signer.nip44) {
        try {
          const events = await nostr.query([
            { kinds: [31234], authors: [user.pubkey], '#d': [draftSlug], limit: 1 },
          ]);
          if (events.length > 0 && events[0].content.trim()) {
            const decrypted = await user.signer.nip44.decrypt(user.pubkey, events[0].content);
            const inner = JSON.parse(decrypted) as Record<string, unknown>;
            const tags = (inner.tags ?? []) as string[][];
            const getTag = (name: string) => tags.find(t => t[0] === name)?.[1] || '';
            const getTags = (name: string) => tags.filter(t => t[0] === name).map(t => t[1]);
            setInitialData({
              title: getTag('title'),
              summary: getTag('summary'),
              content: (inner.content as string) || '',
              image: getTag('image'),
              tags: getTags('t'),
              slug: getTag('d'),
            });
            setLoading(false);
            return;
          }
        } catch {
          // Fall through to localStorage
        }
      }

      // Fallback to localStorage
      const drafts = getLocalDrafts();
      const draft = drafts.find((d) => d.slug === draftSlug);
      if (draft) {
        setInitialData({
          title: draft.title,
          summary: draft.summary,
          content: draft.content,
          image: draft.image,
          tags: draft.tags,
          slug: draft.slug,
        });
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
