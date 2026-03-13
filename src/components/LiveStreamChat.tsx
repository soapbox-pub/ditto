import { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Send, MessageCircle } from 'lucide-react';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { getDisplayName } from '@/lib/getDisplayName';
import { useProfileUrl } from '@/hooks/useProfileUrl';
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

  return (
    <div className={cn('flex flex-col overflow-hidden', className)}>
      {/* Chat header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
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
            <ChatMessage key={msg.id} event={msg} />
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

function ChatMessage({ event }: { event: NostrEvent }) {
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const avatarShape = getAvatarShape(metadata as Record<string, unknown>);
  const displayName = getDisplayName(metadata, event.pubkey);
  const profileUrl = useProfileUrl(event.pubkey, metadata);

  return (
    <div className="group flex items-start gap-2 py-1 px-1 rounded hover:bg-secondary/40 transition-colors">
      <Link to={profileUrl} className="shrink-0 mt-0.5" onClick={(e) => e.stopPropagation()}>
        <Avatar shape={avatarShape} className="size-6">
          <AvatarImage src={metadata?.picture} alt={displayName} />
          <AvatarFallback className="bg-primary/20 text-primary text-[9px]">
            {displayName[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </Link>
      <div className="flex-1 min-w-0">
        <span className="inline">
          <Link
            to={profileUrl}
            className="text-xs font-semibold text-primary hover:underline mr-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            {displayName}
          </Link>
          <span className="text-sm text-foreground break-words">{event.content}</span>
        </span>
        <span className="text-[10px] text-muted-foreground/60 ml-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {shortTimeAgo(event.created_at)}
        </span>
      </div>
    </div>
  );
}
