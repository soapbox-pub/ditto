import { useCallback, useMemo, useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { ArrowLeft, Globe, MessageSquare } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { NoteCard } from '@/components/NoteCard';
import { ComposeBox } from '@/components/ComposeBox';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import {
  parseExternalUri,
  headerLabel,
  seoTitle,
  UrlContentHeader,
  BookContentHeader,
  CountryContentHeader,
} from '@/components/ExternalContentHeader';
import { useAppContext } from '@/hooks/useAppContext';
import { useComments } from '@/hooks/useComments';
import { useMuteList } from '@/hooks/useMuteList';
import { isEventMuted } from '@/lib/muteHelpers';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import NotFound from './NotFound';

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export function ExternalContentPage() {
  const { config } = useAppContext();
  const { '*': rawUri } = useParams();
  const location = useLocation();

  // Support both encoded URLs (/i/https%3A%2F%2F...) and bare URLs (/i/https://...?q=x).
  // For bare URLs the browser splits the target's query string into location.search,
  // so we reattach it. For encoded URLs we decode the whole thing.
  const uri = useMemo(() => {
    if (!rawUri) return '';
    // If the wildcard param looks already encoded (no "://" present), decode it.
    if (!rawUri.includes('://')) {
      return decodeURIComponent(rawUri);
    }
    // Otherwise it's a bare URL — reattach any query string the browser separated out.
    return rawUri + location.search;
  }, [rawUri, location.search]);

  const content = useMemo(() => {
    if (!uri) return null;
    return parseExternalUri(uri);
  }, [uri]);

  useSeoMeta({ title: content ? seoTitle(content, config.appName) : `External Content | ${config.appName}` });

  // Build the NIP-73 identifier for comments.
  // For URLs, the raw URL is used. For others, the full prefixed identifier.
  const commentRoot = useMemo(() => {
    if (!content) return undefined;
    return new URL(content.value);
  }, [content]);

  const { muteItems } = useMuteList();
  const { data: commentsData, isLoading: commentsLoading } = useComments(commentRoot, 500);

  // Build a reply tree: direct replies each paired with their first sub-reply.
  const orderedReplies = useMemo(() => {
    const topLevel = commentsData?.topLevelComments ?? [];
    const filteredTopLevel = muteItems.length > 0
      ? topLevel.filter((r) => !isEventMuted(r, muteItems))
      : topLevel;

    // Sort oldest-first for threaded conversation view (useComments returns newest-first)
    const sorted = [...filteredTopLevel].sort((a, b) => a.created_at - b.created_at);

    return sorted.map((reply) => {
      const directReplies = commentsData?.getDirectReplies(reply.id) ?? [];
      return {
        reply,
        firstSubReply: directReplies[0] as import('@nostrify/nostrify').NostrEvent | undefined,
      };
    });
  }, [commentsData, muteItems]);

  // FAB opens the comment compose dialog
  const [composeOpen, setComposeOpen] = useState(false);
  const openCompose = useCallback(() => setComposeOpen(true), []);

  useLayoutOptions({
    showFAB: true,
    onFabClick: openCompose,
  });

  if (!content || !uri || !commentRoot) {
    return <NotFound />;
  }

  return (
    <main className="min-h-screen">
      {/* Non-sticky transparent header */}
      <div className="flex items-center gap-4 px-4 mt-4 mb-5">
        <Link to="/" className="p-2 rounded-full hover:bg-secondary transition-colors sidebar:hidden">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-xl font-bold truncate">{headerLabel(content)}</h1>
      </div>

      <div className="px-4 space-y-6 pb-8">
        {/* Content-specific header */}
        {content.type === 'url' && <UrlContentHeader url={content.value} />}
        {content.type === 'isbn' && <BookContentHeader isbn={content.value} />}
        {content.type === 'iso3166' && <CountryContentHeader code={content.code} />}
        {content.type === 'unknown' && (
          <div className="rounded-2xl border border-border p-5 text-center">
            <Globe className="size-8 mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground break-all">{content.value}</p>
          </div>
        )}
      </div>

      {/* Inline compose box */}
      <ComposeBox compact replyTo={commentRoot} />

      {/* Comment compose dialog (opened via FAB) */}
      <ReplyComposeModal event={commentRoot} open={composeOpen} onOpenChange={setComposeOpen} />

      {/* Threaded comments list */}
      <div>
        {commentsLoading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex gap-3">
                  <Skeleton className="size-10 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-3 w-28" />
                    </div>
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : orderedReplies.length > 0 ? (
          orderedReplies.map(({ reply, firstSubReply }) => (
            <div key={reply.id}>
              <NoteCard event={reply} threaded={!!firstSubReply} />
              {firstSubReply && (
                <NoteCard event={firstSubReply} threadedLast />
              )}
            </div>
          ))
        ) : (
          <div className="py-12 text-center text-muted-foreground text-sm">
            <MessageSquare className="size-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium mb-2">No comments yet</p>
            <p>Be the first to share your thoughts about this!</p>
          </div>
        )}
      </div>
    </main>
  );
}
