import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Send, MessageCircle, Zap } from 'lucide-react';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import type { Event } from 'nostr-tools';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ZapDialog } from '@/components/ZapDialog';
import { ProfileHoverCard } from '@/components/ProfileHoverCard';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { getDisplayName } from '@/lib/getDisplayName';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { canZap } from '@/lib/canZap';
import { cn } from '@/lib/utils';

interface LiveStreamChatProps {
  /** The `a` tag value: `30311:<pubkey>:<d-tag>` */
  aTag: string;
  className?: string;
}

/** Format seconds-ago into a short time string. */
function shortTimeAgo(timestamp: number): string {
  const diff = Math.floor(Date.now() / 1000) - timestamp;
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export function LiveStreamChat({ aTag, className }: LiveStreamChatProps) {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const { mutateAsync: createEvent, isPending: isSending } = useNostrPublish();
  const [message, setMessage] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAutoScrollRef = useRef(true);

  // Fetch existing chat messages
  const { data: messages = [], isLoading } = useQuery<NostrEvent[]>({
    queryKey: ['live-chat', aTag],
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [{ kinds: [1311], '#a': [aTag], limit: 200 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );
      return events.sort((a, b) => a.created_at - b.created_at);
    },
    staleTime: 10_000,
    refetchInterval: 5_000,
  });

  // Subscribe to new messages in real-time
  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        for await (const msg of nostr.req(
          [{ kinds: [1311], '#a': [aTag], since: Math.floor(Date.now() / 1000) }],
          { signal: controller.signal },
        )) {
          if (msg[0] === 'EVENT') {
            const event = msg[2] as NostrEvent;
            queryClient.setQueryData<NostrEvent[]>(['live-chat', aTag], (old = []) => {
              if (old.some(e => e.id === event.id)) return old;
              return [...old, event].sort((a, b) => a.created_at - b.created_at);
            });
          }
        }
      } catch {
        // Subscription ended
      }
    })();

    return () => controller.abort();
  }, [nostr, aTag, queryClient]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (isAutoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    isAutoScrollRef.current = isAtBottom;
  }, []);

  const handleSend = async () => {
    const text = message.trim();
    if (!text || !user || isSending) return;

    try {
      await createEvent({
        kind: 1311,
        content: text,
        tags: [['a', aTag, '', 'root']],
      });
      setMessage('');
    } catch {
      // Error handled by mutation
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Bulk query reactions (kind 7) for all visible chat messages
  const messageIds = useMemo(() => messages.map((m) => m.id), [messages]);
  const { data: reactions = [] } = useQuery<NostrEvent[]>({
    queryKey: ['chat-reactions', aTag, messageIds.length],
    queryFn: async ({ signal }) => {
      if (messageIds.length === 0) return [];
      const events = await nostr.query(
        [{ kinds: [7], '#e': messageIds, limit: 500 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );
      return events;
    },
    enabled: messageIds.length > 0,
    staleTime: 15_000,
    refetchInterval: 10_000,
  });

  // Group reactions by event ID
  const reactionsByEvent = useMemo(() => {
    const map = new Map<string, NostrEvent[]>();
    for (const r of reactions) {
      const eTag = r.tags.find(([n]) => n === 'e')?.[1];
      if (!eTag) continue;
      const list = map.get(eTag) || [];
      list.push(r);
      map.set(eTag, list);
    }
    return map;
  }, [reactions]);

  return (
    <div className={cn('flex flex-col overflow-hidden', className)}>
      {/* Chat header */}
      <div className="flex items-center gap-2 px-4 pr-10 py-3 border-b border-border shrink-0">
        <MessageCircle className="size-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Live Chat</span>
        <span className="text-xs text-muted-foreground ml-auto tabular-nums">
          {messages.length} message{messages.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Messages area — scrollable, takes remaining space */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1"
        onScroll={handleScroll}
      >
        {isLoading ? (
          <div className="space-y-3 p-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-start gap-2">
                <Skeleton className="size-6 rounded-full shrink-0" />
                <div className="space-y-1 flex-1">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <MessageCircle className="size-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">No messages yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Be the first to say something!</p>
          </div>
        ) : (
          messages.map((msg) => (
            <ChatMessage key={msg.id} event={msg} reactions={reactionsByEvent.get(msg.id)} />
          ))
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-border p-3 shrink-0">
        {user ? (
          <div className="flex gap-2">
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Say something..."
              className="flex-1 h-9 text-sm"
              disabled={isSending}
              maxLength={500}
            />
            <Button
              size="sm"
              onClick={handleSend}
              disabled={!message.trim() || isSending}
              className="h-9 px-3"
            >
              <Send className="size-4" />
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-1">
            Log in to participate in the chat
          </p>
        )}
      </div>
    </div>
  );
}

/** Regex to detect image/GIF URLs in chat messages. */
const IMAGE_URL_REGEX = /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg)(\?[^\s]*)?/i;

/** Regex to split content into URL and non-URL segments. */
const URL_REGEX = /(https?:\/\/[^\s]+)/g;

/** Render chat message content with inline images/GIFs and clickable links. */
function ChatContent({ content }: { content: string }) {
  const parts = content.split(URL_REGEX);

  return (
    <>
      {parts.map((part, i) => {
        if (URL_REGEX.test(part)) {
          // Reset regex lastIndex since test() advances it
          URL_REGEX.lastIndex = 0;

          if (IMAGE_URL_REGEX.test(part)) {
            // Render as inline image
            return (
              <a
                key={i}
                href={part}
                target="_blank"
                rel="noopener noreferrer"
                className="block my-1"
                onClick={(e) => e.stopPropagation()}
              >
                <img
                  src={part}
                  alt=""
                  loading="lazy"
                  className="max-w-full max-h-48 rounded-lg object-contain"
                  onError={(e) => {
                    // If image fails to load, replace with a link
                    const el = e.currentTarget;
                    const link = document.createElement('a');
                    link.href = part;
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                    link.className = 'text-sm text-primary hover:underline break-all';
                    link.textContent = part;
                    el.parentElement?.replaceChild(link, el);
                  }}
                />
              </a>
            );
          }

          // Render as clickable link
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline break-all"
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </a>
          );
        }

        // Reset regex
        URL_REGEX.lastIndex = 0;

        // Plain text
        if (!part) return null;
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

/** Quick reaction emojis for chat messages. */
const CHAT_QUICK_EMOJIS = ['❤️', '😂', '🔥', '👀'];

function ChatMessage({ event, reactions }: { event: NostrEvent; reactions?: NostrEvent[] }) {
  const [zapOpen, setZapOpen] = useState(false);
  const { user } = useCurrentUser();
  const { mutate: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const displayName = getDisplayName(metadata, event.pubkey);
  const profileUrl = useProfileUrl(event.pubkey, metadata);
  const showZap = user && user.pubkey !== event.pubkey && canZap(metadata);

  // Aggregate reactions into emoji → count
  const reactionSummary = useMemo(() => {
    if (!reactions || reactions.length === 0) return [];
    const counts = new Map<string, number>();
    for (const r of reactions) {
      const emoji = r.content || '❤️';
      counts.set(emoji, (counts.get(emoji) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [reactions]);

  const handleReact = useCallback((emoji: string) => {
    if (!user) return;
    publishEvent(
      {
        kind: 7,
        content: emoji,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['e', event.id],
          ['p', event.pubkey],
          ['k', String(event.kind)],
        ],
      },
      {
        onSuccess: () => {
          // Refresh reactions after a delay
          setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['chat-reactions'] });
          }, 2000);
        },
      },
    );
  }, [user, event, publishEvent, queryClient]);

  const zapTriggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (zapOpen && zapTriggerRef.current) {
      zapTriggerRef.current.click();
      setZapOpen(false);
    }
  }, [zapOpen]);

  return (
    <div className="group relative flex items-start gap-2 py-1 px-1 rounded hover:bg-secondary/40 transition-colors">
      <ProfileHoverCard pubkey={event.pubkey} asChild>
        <Link to={profileUrl} className="shrink-0 mt-0.5" onClick={(e) => e.stopPropagation()}>
          <Avatar className="size-6">
            <AvatarImage src={metadata?.picture} alt={displayName} />
            <AvatarFallback className="bg-primary/20 text-primary text-[9px]">
              {displayName[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </Link>
      </ProfileHoverCard>
      <div className="flex-1 min-w-0">
        <div>
          <ProfileHoverCard pubkey={event.pubkey} asChild>
            <Link
              to={profileUrl}
              className="text-xs font-semibold text-primary hover:underline mr-1.5"
              onClick={(e) => e.stopPropagation()}
            >
              {displayName}
            </Link>
          </ProfileHoverCard>
          <span className="text-sm text-foreground break-words">
            <ChatContent content={event.content} />
          </span>
        </div>

        {/* Reaction summary badges */}
        {reactionSummary.length > 0 && (
          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
            {reactionSummary.map(([emoji, count]) => (
              <button
                key={emoji}
                type="button"
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-secondary/60 hover:bg-secondary text-[11px] transition-colors"
                onClick={() => handleReact(emoji)}
              >
                <span>{emoji}</span>
                {count > 1 && <span className="text-muted-foreground tabular-nums">{count}</span>}
              </button>
            ))}
          </div>
        )}

        <span className="text-[10px] text-muted-foreground/60 ml-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {shortTimeAgo(event.created_at)}
        </span>
      </div>

      {/* Hover action bar — floats on the right edge */}
      {user && (
        <div className="absolute -top-2 right-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto z-10">
          <div className="flex items-center gap-0.5 bg-background border border-border rounded-lg shadow-md px-1 py-0.5">
            {CHAT_QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="size-6 flex items-center justify-center rounded hover:bg-secondary/80 text-sm transition-colors"
                onClick={() => handleReact(emoji)}
                title={`React with ${emoji}`}
              >
                {emoji}
              </button>
            ))}
            {showZap && (
              <button
                type="button"
                className="size-6 flex items-center justify-center rounded hover:bg-secondary/80 text-amber-500 transition-colors"
                onClick={() => setZapOpen(true)}
                title="Zap"
              >
                <Zap className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ZapDialog rendered outside hover area */}
      {showZap && (
        <ZapDialog target={event as Event}>
          <button ref={zapTriggerRef} className="hidden" aria-hidden />
        </ZapDialog>
      )}
    </div>
  );
}
