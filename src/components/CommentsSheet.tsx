/**
 * CommentsModal — a centered rounded modal for displaying and composing
 * comments/replies on any Nostr event.
 */

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { useAuthor } from '@/hooks/useAuthor';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { getDisplayName } from '@/lib/getDisplayName';
import { timeAgo } from '@/lib/timeAgo';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { ProfileHoverCard } from '@/components/ProfileHoverCard';
import { ComposeBox } from '@/components/ComposeBox';

function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

// ── data hook ─────────────────────────────────────────────────────────────────

export function useEventComments(event: NostrEvent | undefined) {
  const { nostr } = useNostr();

  const aTag = event
    ? `${event.kind}:${event.pubkey}:${getTag(event.tags, 'd') ?? ''}`
    : undefined;

  return useQuery<NostrEvent[]>({
    queryKey: ['event-comments', aTag ?? event?.id ?? ''],
    queryFn: async ({ signal }) => {
      if (!event) return [];
      const abort = AbortSignal.any([signal, AbortSignal.timeout(5000)]);
      const filter =
        event.kind >= 30000 && event.kind < 40000 && aTag
          ? { kinds: [1111, 1244], '#A': [aTag], limit: 80 }
          : event.kind === 1
          ? { kinds: [1], '#e': [event.id], limit: 80 }
          : { kinds: [1111], '#e': [event.id], limit: 80 };
      const events = await nostr.query([filter], { signal: abort });
      const seen = new Set<string>();
      return events
        .filter((e) => { if (seen.has(e.id)) return false; seen.add(e.id); return true; })
        .sort((a, b) => b.created_at - a.created_at);
    },
    enabled: !!event,
    staleTime: 15_000,
    refetchInterval: 20_000,
  });
}

// ── comment row ───────────────────────────────────────────────────────────────

function CommentRow({ event }: { event: NostrEvent }) {
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const displayName = getDisplayName(metadata, event.pubkey);
  const profileUrl = useProfileUrl(event.pubkey, metadata);

  return (
    <div className="flex gap-2.5 px-4 py-2.5 hover:bg-muted/30 transition-colors">
      <ProfileHoverCard pubkey={event.pubkey} asChild>
        <Link to={profileUrl} className="shrink-0">
          {author.isLoading ? (
            <Skeleton className="size-7 rounded-full" />
          ) : (
            <Avatar className="size-7">
              <AvatarImage src={metadata?.picture} alt={displayName} />
              <AvatarFallback className="text-[10px] bg-primary/20 text-primary">
                {displayName[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
          )}
        </Link>
      </ProfileHoverCard>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5 mb-0.5">
          <ProfileHoverCard pubkey={event.pubkey} asChild>
            <Link to={profileUrl} className="text-xs font-semibold hover:underline truncate max-w-[140px]">
              {displayName}
            </Link>
          </ProfileHoverCard>
          <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(event.created_at)}</span>
        </div>
        <p className="text-xs text-foreground/90 leading-relaxed break-words line-clamp-4">
          {event.content}
        </p>
      </div>
    </div>
  );
}

function CommentSkeleton() {
  return (
    <div className="flex gap-2.5 px-4 py-2.5">
      <Skeleton className="size-7 rounded-full shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    </div>
  );
}

// ── modal ─────────────────────────────────────────────────────────────────────

interface CommentsModalProps {
  event: NostrEvent | undefined;
  open: boolean;
  onClose: () => void;
}

export function CommentsSheet({ event, open, onClose }: CommentsModalProps) {
  // Always pass the current event (not gated on `open`) so the query key
  // updates immediately when the event changes — prevents stale replies
  // from a previous image flashing before the new query resolves.
  const { data: rawComments = [], isLoading } = useEventComments(event);

  const comments = useMemo(() => {
    const seen = new Set<string>();
    return rawComments.filter((e) => seen.has(e.id) ? false : (seen.add(e.id), true));
  }, [rawComments]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm animate-in fade-in-0 duration-200"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
      />

      {/* Modal — centered, rounded */}
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-lg max-h-[80vh] flex flex-col bg-background/90 backdrop-blur-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 fade-in-0 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 shrink-0">
            <h3 className="font-semibold text-sm">{event?.kind === 1 ? 'Replies' : 'Comments'}</h3>
            <button
              className="p-1.5 rounded-full hover:bg-secondary transition-colors text-muted-foreground"
              onClick={onClose}
            >
              <X className="size-4" strokeWidth={4} />
            </button>
          </div>

          {/* Compose — top */}
          {event && (
            <div className="shrink-0 -mb-px overflow-hidden">
              <ComposeBox replyTo={event} compact placeholder={event?.kind === 1 ? 'Add a reply…' : 'Add a comment…'} />
            </div>
          )}

          {/* Comment list */}
          <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-border/50">
            {isLoading ? (
              <div className="py-2">
                {Array.from({ length: 5 }).map((_, i) => <CommentSkeleton key={i} />)}
              </div>
            ) : comments.length === 0 ? (
              <div className="flex items-center justify-center h-32">
                <p className="text-sm text-muted-foreground">No comments yet. Be the first!</p>
              </div>
            ) : (
              comments.map((reply) => <CommentRow key={reply.id} event={reply} />)
            )}
          </div>
        </div>
      </div>
    </>
  );
}
