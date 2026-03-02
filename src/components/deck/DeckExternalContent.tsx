import { useCallback, useMemo, useRef, useState } from 'react';
import { Globe, Heart, MessageSquare, Repeat2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ThreadedReplyList } from '@/components/ThreadedReplyList';
import { ComposeBox } from '@/components/ComposeBox';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import { QuickReactMenu } from '@/components/QuickReactMenu';
import {
  UrlContentHeader,
  BookContentHeader,
  CountryContentHeader,
} from '@/components/ExternalContentHeader';
import { parseExternalUri, type ExternalContent } from '@/lib/externalContent';
import { useComments } from '@/hooks/useComments';
import { useMuteList } from '@/hooks/useMuteList';
import { isEventMuted } from '@/lib/muteHelpers';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/useToast';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useExternalUserReaction,
  useExternalReactionCount,
} from '@/hooks/useExternalReactions';
import type { NostrEvent } from '@nostrify/nostrify';

interface DeckExternalContentProps {
  uri: string;
}

function getExternalKTag(content: ExternalContent): string {
  switch (content.type) {
    case 'url': return 'web';
    case 'isbn': return 'isbn';
    case 'iso3166': return 'iso3166';
    default: return 'web';
  }
}

function DeckActionBar({ content }: { content: ExternalContent }) {
  const { user } = useCurrentUser();
  const { mutate: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const identifier = content.value;

  const userReaction = useExternalUserReaction(content);
  const reactionCount = useExternalReactionCount(content);
  const hasReacted = !!userReaction;

  const [reactOpen, setReactOpen] = useState(false);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const justClosedRef = useRef(false);
  const pickerExpandedRef = useRef(false);
  const [shareOpen, setShareOpen] = useState(false);

  const handleMouseEnter = useCallback(() => {
    if (!user || justClosedRef.current) return;
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setReactOpen(true);
  }, [user]);

  const handleMouseLeave = useCallback(() => {
    if (pickerExpandedRef.current) return;
    closeTimeoutRef.current = setTimeout(() => setReactOpen(false), 150);
  }, []);

  const handleReact = useCallback((emoji: string) => {
    if (!user) return;
    queryClient.setQueryData(['external-user-reaction', identifier], emoji || '+');
    queryClient.setQueryData(['external-reaction-count', identifier], (prev: number | undefined) => (prev ?? 0) + 1);
    publishEvent(
      {
        kind: 17,
        content: emoji,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['k', getExternalKTag(content)], ['i', identifier]],
      },
      {
        onSuccess: () => {
          setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['external-user-reaction', identifier] });
            queryClient.invalidateQueries({ queryKey: ['external-reaction-count', identifier] });
          }, 3000);
        },
        onError: () => {
          toast({ title: 'Failed to react', variant: 'destructive' });
          queryClient.setQueryData(['external-user-reaction', identifier], null);
          queryClient.setQueryData(['external-reaction-count', identifier], (prev: number | undefined) => Math.max(0, (prev ?? 1) - 1));
        },
      },
    );
  }, [user, content, identifier, publishEvent, queryClient, toast]);

  return (
    <div className="flex items-center gap-1 px-4 py-2 border-b border-border">
      <Popover open={reactOpen} onOpenChange={(open) => {
        if (open && justClosedRef.current) return;
        if (!open) pickerExpandedRef.current = false;
        setReactOpen(open);
      }}>
        <PopoverTrigger asChild>
          <button
            className={`flex items-center gap-1.5 p-2 rounded-full transition-colors ${hasReacted ? 'text-pink-500' : 'text-muted-foreground hover:text-pink-500 hover:bg-pink-500/10'}`}
            title="React"
            onClick={(e) => { e.stopPropagation(); if (!user || justClosedRef.current) return; setReactOpen((prev) => !prev); }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            {hasReacted ? (
              <span className="size-5 flex items-center justify-center text-base leading-none">
                {userReaction === '+' ? '👍' : userReaction}
              </span>
            ) : (
              <Heart className="size-5" />
            )}
            {reactionCount > 0 && <span className="text-sm tabular-nums">{reactionCount}</span>}
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto p-0 border-0 bg-transparent shadow-none"
          side="top" align="start"
          onClick={(e) => e.stopPropagation()}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <QuickReactMenu
            eventId={identifier} eventPubkey="" eventKind={17}
            onExpandChange={(expanded) => { pickerExpandedRef.current = expanded; }}
            onClose={() => { pickerExpandedRef.current = false; justClosedRef.current = true; setReactOpen(false); setTimeout(() => { justClosedRef.current = false; }, 300); }}
            onReact={handleReact}
          />
        </PopoverContent>
      </Popover>

      <button
        className="flex items-center gap-1.5 p-2 rounded-full transition-colors text-muted-foreground hover:text-accent hover:bg-accent/10"
        title="Share to feed"
        onClick={() => setShareOpen(true)}
      >
        <Repeat2 className="size-5" />
      </button>

      {shareOpen && (
        <ReplyComposeModal open={shareOpen} onOpenChange={setShareOpen} initialContent={identifier} title="Share to feed" />
      )}
    </div>
  );
}

/** Deck column body for external content discussion (NIP-73 /i/:uri). */
export function DeckExternalContent({ uri }: DeckExternalContentProps) {
  const content = useMemo(() => parseExternalUri(uri), [uri]);
  const { muteItems } = useMuteList();

  const commentRoot = useMemo(() => {
    if (!content) return undefined;
    try { return new URL(content.value); } catch { return undefined; }
  }, [content]);

  const { data: commentsData, isLoading: commentsLoading } = useComments(commentRoot, 500);

  const orderedReplies = useMemo(() => {
    const topLevel = commentsData?.topLevelComments ?? [];
    const filtered = muteItems.length > 0
      ? topLevel.filter((r) => !isEventMuted(r, muteItems))
      : topLevel;
    const sorted = [...filtered].sort((a, b) => a.created_at - b.created_at);
    return sorted.map((reply) => ({
      reply,
      firstSubReply: (commentsData?.getDirectReplies(reply.id) ?? [])[0] as NostrEvent | undefined,
    }));
  }, [commentsData, muteItems]);

  const [composeOpen, setComposeOpen] = useState(false);

  if (!content) {
    return <div className="py-16 text-center text-muted-foreground">Invalid content URI.</div>;
  }

  return (
    <div>
      <div className="px-4 space-y-6 pb-4 pt-4">
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

      <DeckActionBar content={content} />

      {commentRoot && <ComposeBox compact replyTo={commentRoot} />}

      {commentRoot && (
        <ReplyComposeModal event={commentRoot} open={composeOpen} onOpenChange={setComposeOpen} />
      )}

      <div>
        {commentsLoading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex gap-3">
                  <Skeleton className="size-10 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : orderedReplies.length > 0 ? (
          <ThreadedReplyList replies={orderedReplies} />
        ) : (
          <div className="py-12 text-center text-muted-foreground text-sm">
            <MessageSquare className="size-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium mb-2">No comments yet</p>
            <p>Be the first to share your thoughts!</p>
          </div>
        )}
      </div>
    </div>
  );
}
