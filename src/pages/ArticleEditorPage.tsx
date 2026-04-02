import { useEffect, useState } from 'react';
import { useSearchParams, useParams } from 'react-router-dom';
import { useNostr } from '@nostrify/react';
import { nip19 } from 'nostr-tools';
import type { AddressPointer } from 'nostr-tools/nip19';
import { Loader2 } from 'lucide-react';

import { ArticleEditor, type ArticleData } from '@/components/articles/ArticleEditor';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { getLocalDrafts } from '@/lib/localDrafts';

/** Thin page wrapper for /articles/new and /articles/edit/:naddr */
export function ArticleEditorPage() {
  useLayoutOptions({ showFAB: false, hasSubHeader: true });

  const [searchParams] = useSearchParams();
  const { naddr: naddrParam } = useParams<{ naddr: string }>();
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  const draftSlug = searchParams.get('draft');

  const [initialData, setInitialData] = useState<(Partial<ArticleData> & { publishedAt?: number }) | undefined>(undefined);
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(!!naddrParam || !!draftSlug);

  // Load draft from relay or localStorage if ?draft=<slug>
  useEffect(() => {
    if (!draftSlug) return;

    // Try relay draft first if logged in, then fall back to localStorage
    const loadDraft = async () => {
      if (user) {
        try {
          const events = await nostr.query([
            { kinds: [30024], authors: [user.pubkey], '#d': [draftSlug], limit: 1 },
          ]);
          if (events.length > 0) {
            const event = events[0];
            const getTag = (name: string) => event.tags.find((t) => t[0] === name)?.[1] || '';
            const getTags = (name: string) => event.tags.filter((t) => t[0] === name).map((t) => t[1]);
            setInitialData({
              title: getTag('title'),
              summary: getTag('summary'),
              content: event.content,
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

  // Load existing article for editing if /articles/edit/:naddr
  useEffect(() => {
    if (!naddrParam) return;

    let decoded: { type: string; data: AddressPointer };
    try {
      decoded = nip19.decode(naddrParam) as { type: 'naddr'; data: AddressPointer };
      if (decoded.type !== 'naddr') {
        setLoading(false);
        return;
      }
    } catch {
      setLoading(false);
      return;
    }

    const addr = decoded.data;

    nostr
      .query([
        {
          kinds: [addr.kind],
          authors: [addr.pubkey],
          '#d': [addr.identifier],
          limit: 1,
        },
      ])
      .then((events) => {
        if (events.length > 0) {
          const event = events[0];
          const getTag = (name: string) =>
            event.tags.find((t) => t[0] === name)?.[1] || '';
          const getTags = (name: string) =>
            event.tags.filter((t) => t[0] === name).map((t) => t[1]);

          const publishedAtTag = getTag('published_at');
          const publishedAt = publishedAtTag
            ? parseInt(publishedAtTag) * 1000
            : event.created_at * 1000;

          setInitialData({
            title: getTag('title'),
            summary: getTag('summary'),
            content: event.content,
            image: getTag('image'),
            tags: getTags('t'),
            slug: getTag('d'),
            publishedAt,
          });
          setEditMode(true);
        }
      })
      .catch((err) => {
        console.error('Failed to load article for editing:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [naddrParam, nostr]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <ArticleEditor initialData={initialData} editMode={editMode} />;
}
