import { useState, useMemo, useCallback } from 'react';
import { useSeoMeta } from '@unhead/react';
import { ArrowLeft, Heart, Repeat2, Zap, AtSign, MessageCircle, MoreHorizontal } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { MainLayout } from '@/components/MainLayout';
import { NoteContent } from '@/components/NoteContent';
import { ReactionButton } from '@/components/ReactionButton';
import { NoteMoreMenu } from '@/components/NoteMoreMenu';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import { useEvent } from '@/hooks/useEvent';
import { useEventStats } from '@/hooks/useTrending';
import { genUserName } from '@/lib/genUserName';
import { timeAgo } from '@/lib/timeAgo';
import { cn } from '@/lib/utils';

type NotificationTab = 'all' | 'mentions';

export function NotificationsPage() {
  useSeoMeta({
    title: 'Notifications | Mew',
    description: 'Your Nostr notifications',
  });

  const [activeTab, setActiveTab] = useState<NotificationTab>('all');
  const { user } = useCurrentUser();
  const { nostr } = useNostr();

  const { data: notifications, isLoading } = useQuery<NostrEvent[]>({
    queryKey: ['notifications', user?.pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!user) return [];
      const events = await nostr.query(
        [{ kinds: [1, 6, 7, 9735], '#p': [user.pubkey], limit: 50 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );
      return events
        .filter((e) => e.pubkey !== user.pubkey)
        .sort((a, b) => b.created_at - a.created_at);
    },
    enabled: !!user,
  });

  const filteredNotifications = useMemo(() => {
    if (!notifications) return [];
    if (activeTab === 'mentions') {
      return notifications.filter((e) => e.kind === 1);
    }
    return notifications;
  }, [notifications, activeTab]);

  const tabs: { key: NotificationTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'mentions', label: 'Mentions' },
  ];

  return (
    <MainLayout hideMobileTopBar>
      <main className="flex-1 min-w-0 sidebar:max-w-[600px] sidebar:border-l lg:border-r border-border min-h-screen">
        {/* Header */}
        <div className="flex items-center gap-4 px-4 py-3 sticky top-0 bg-background/80 backdrop-blur-md z-10 border-b border-border">
          <Link to="/" className="p-2 rounded-full hover:bg-secondary transition-colors">
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="text-xl font-bold">Notifications</h1>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-border">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={cn(
                'flex-1 py-3 text-sm font-semibold transition-colors relative hover:bg-secondary/40',
                activeTab === key ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {label}
              {activeTab === key && (
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-[3px] bg-primary rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        {!user ? (
          <div className="py-16 text-center text-muted-foreground">
            Log in to see your notifications.
          </div>
        ) : isLoading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 4 }).map((_, i) => (
              <NotificationSkeleton key={i} />
            ))}
          </div>
        ) : filteredNotifications.length > 0 ? (
          <div className="divide-y divide-border">
            {filteredNotifications.map((event) => (
              <NotificationItem key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <div className="py-16 text-center text-muted-foreground">
            No notifications yet.
          </div>
        )}
      </main>
    </MainLayout>
  );
}

/** Determines the type of notification and renders accordingly. */
function NotificationItem({ event }: { event: NostrEvent }) {
  switch (event.kind) {
    case 7:
      return <LikeNotification event={event} />;
    case 6:
      return <RepostNotification event={event} />;
    case 9735:
      return <ZapNotification event={event} />;
    case 1:
      return <MentionNotification event={event} />;
    default:
      return null;
  }
}

/** Gets the referenced event ID from an event's tags. */
function getReferencedEventId(event: NostrEvent): string | undefined {
  // Try 'e' tag first
  const eTag = event.tags.find(([name]) => name === 'e');
  return eTag?.[1];
}

/** Extracts image URLs from note content. */
function extractImages(content: string): string[] {
  const urlRegex = /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg)(\?[^\s]*)?/gi;
  return content.match(urlRegex) || [];
}

/** Formats a sats amount into a compact human-readable string. */
function formatSats(sats: number): string {
  if (sats >= 1_000_000) return `${(sats / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (sats >= 1_000) return `${(sats / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return sats.toString();
}

// ──────────────────────────────────────
// Like Notification: "❤️ {name} liked your post"
// Shows the original post being liked
// ──────────────────────────────────────
function LikeNotification({ event }: { event: NostrEvent }) {
  const referencedEventId = getReferencedEventId(event);
  const { data: referencedEvent } = useEvent(referencedEventId);

  return (
    <div className="px-4 pt-3 pb-1">
      <NotificationHeader
        actorPubkey={event.pubkey}
        icon={<Heart className="size-4 fill-pink-500 text-pink-500" />}
        action="liked your post"
      />
      {referencedEvent && (
        <ReferencedPostCard event={referencedEvent} />
      )}
    </div>
  );
}

// ──────────────────────────────────────
// Repost Notification: "🔁 {name} reposted your note"
// Shows the original post being reposted
// ──────────────────────────────────────
function RepostNotification({ event }: { event: NostrEvent }) {
  const referencedEventId = getReferencedEventId(event);
  const { data: referencedEvent } = useEvent(referencedEventId);

  return (
    <div className="px-4 pt-3 pb-1">
      <NotificationHeader
        actorPubkey={event.pubkey}
        icon={<Repeat2 className="size-4 text-green-500" />}
        action="reposted your note"
      />
      {referencedEvent && (
        <ReferencedPostCard event={referencedEvent} />
      )}
    </div>
  );
}

// ──────────────────────────────────────
// Zap Notification: "⚡ {name} zapped you"
// Shows the original post being zapped
// ──────────────────────────────────────
function ZapNotification({ event }: { event: NostrEvent }) {
  const referencedEventId = getReferencedEventId(event);
  const { data: referencedEvent } = useEvent(referencedEventId);

  // Extract zap amount
  const zapAmount = useMemo(() => {
    const amountTag = event.tags.find(([name]) => name === 'amount');
    if (amountTag?.[1]) {
      const msats = parseInt(amountTag[1], 10);
      if (!isNaN(msats) && msats > 0) return Math.floor(msats / 1000);
    }
    const descTag = event.tags.find(([name]) => name === 'description');
    if (descTag?.[1]) {
      try {
        const zapRequest = JSON.parse(descTag[1]);
        const reqAmountTag = zapRequest.tags?.find(([name]: [string]) => name === 'amount');
        if (reqAmountTag?.[1]) {
          const msats = parseInt(reqAmountTag[1], 10);
          if (!isNaN(msats) && msats > 0) return Math.floor(msats / 1000);
        }
      } catch { /* ignore */ }
    }
    return 0;
  }, [event]);

  // Extract sender pubkey from zap receipt
  const senderPubkey = useMemo(() => {
    const pTag = event.tags.find(([name]) => name === 'P');
    if (pTag?.[1]) return pTag[1];
    const descTag = event.tags.find(([name]) => name === 'description');
    if (descTag?.[1]) {
      try {
        const zapRequest = JSON.parse(descTag[1]);
        if (zapRequest.pubkey) return zapRequest.pubkey;
      } catch { /* ignore */ }
    }
    return event.pubkey;
  }, [event]);

  const amountLabel = zapAmount > 0 ? ` ${formatSats(zapAmount)} sats` : '';

  return (
    <div className="px-4 pt-3 pb-1">
      <NotificationHeader
        actorPubkey={senderPubkey}
        icon={<Zap className="size-4 text-amber-500 fill-amber-500" />}
        action={`zapped you${amountLabel}`}
      />
      {referencedEvent && (
        <ReferencedPostCard event={referencedEvent} />
      )}
    </div>
  );
}

// ──────────────────────────────────────
// Mention Notification: "@ {name} mentioned you"
// Shows the full mention post with action buttons
// ──────────────────────────────────────
function MentionNotification({ event }: { event: NostrEvent }) {
  return (
    <div className="px-4 pt-3 pb-1">
      <NotificationHeader
        actorPubkey={event.pubkey}
        icon={<AtSign className="size-4 text-primary" />}
        action="mentioned you"
      />
      <FullNoteCard event={event} />
    </div>
  );
}

// ──────────────────────────────────────
// Notification Header: icon + actor name + action
// ──────────────────────────────────────
function NotificationHeader({
  actorPubkey,
  icon,
  action,
}: {
  actorPubkey: string;
  icon: React.ReactNode;
  action: string;
}) {
  const author = useAuthor(actorPubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name || genUserName(actorPubkey);
  const npub = useMemo(() => nip19.npubEncode(actorPubkey), [actorPubkey]);

  return (
    <div className="flex items-center gap-2 text-sm mb-2">
      <span className="shrink-0">{icon}</span>
      <Link to={`/${npub}`} className="font-bold hover:underline truncate">
        {displayName}
      </Link>
      <span className="text-muted-foreground shrink-0">{action}</span>
    </div>
  );
}

// ──────────────────────────────────────
// Referenced Post Card: the original post that was liked/reposted/zapped
// Rendered as a full post view similar to NoteCard
// ──────────────────────────────────────
function ReferencedPostCard({ event }: { event: NostrEvent }) {
  const navigate = useNavigate();
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name || genUserName(event.pubkey);
  const nip05 = metadata?.nip05;
  const npub = useMemo(() => nip19.npubEncode(event.pubkey), [event.pubkey]);
  const encodedId = useMemo(
    () => nip19.neventEncode({ id: event.id, author: event.pubkey }),
    [event.id, event.pubkey],
  );
  const images = useMemo(() => extractImages(event.content), [event.content]);
  const { data: stats } = useEventStats(event.id);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);

  const handleNavigate = useCallback(() => {
    navigate(`/${encodedId}`);
  }, [navigate, encodedId]);

  return (
    <div
      className="cursor-pointer"
      onClick={handleNavigate}
    >
      {/* Author row */}
      <div className="flex items-center gap-3">
        <Link to={`/${npub}`} className="shrink-0" onClick={(e) => e.stopPropagation()}>
          <Avatar className="size-11">
            <AvatarImage src={metadata?.picture} alt={displayName} />
            <AvatarFallback className="bg-primary/20 text-primary text-sm">
              {displayName[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </Link>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Link
              to={`/${npub}`}
              className="font-bold text-[15px] hover:underline truncate"
              onClick={(e) => e.stopPropagation()}
            >
              {displayName}
            </Link>
            {metadata?.bot && (
              <span className="text-xs text-primary shrink-0" title="Bot account">🤖</span>
            )}
          </div>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            {nip05 && <span className="truncate">@{nip05}</span>}
            {nip05 && <span className="shrink-0">·</span>}
            <span className="shrink-0">{timeAgo(event.created_at)}</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mt-2">
        <NoteContent event={event} className="text-[15px] leading-relaxed" />
      </div>

      {/* Images */}
      {images.length > 0 && (
        <div
          className={cn(
            'mt-3 rounded-2xl overflow-hidden border border-border',
            images.length > 1 && 'grid grid-cols-2 gap-0.5',
          )}
        >
          {images.slice(0, 4).map((url, i) => (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={url}
                alt=""
                className="w-full h-auto max-h-[400px] object-cover"
                loading="lazy"
              />
            </a>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <ActionButtons event={event} stats={stats} onReply={() => setReplyOpen(true)} onMore={() => setMoreMenuOpen(true)} />

      <NoteMoreMenu event={event} open={moreMenuOpen} onOpenChange={setMoreMenuOpen} />
      <ReplyComposeModal event={event} open={replyOpen} onOpenChange={setReplyOpen} />
    </div>
  );
}

// ──────────────────────────────────────
// Full Note Card: for mention notifications
// Renders the full post with avatar, content, and action buttons
// ──────────────────────────────────────
function FullNoteCard({ event }: { event: NostrEvent }) {
  const navigate = useNavigate();
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name || genUserName(event.pubkey);
  const nip05 = metadata?.nip05;
  const npub = useMemo(() => nip19.npubEncode(event.pubkey), [event.pubkey]);
  const encodedId = useMemo(
    () => nip19.neventEncode({ id: event.id, author: event.pubkey }),
    [event.id, event.pubkey],
  );
  const images = useMemo(() => extractImages(event.content), [event.content]);
  const { data: stats } = useEventStats(event.id);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);

  // Check if this is a reply
  const isReply = event.tags.some(([name]) => name === 'e');
  const replyToPubkey = event.tags.find(([name, , , marker]) => name === 'p' && marker !== 'mention')?.[1];

  const handleNavigate = useCallback(() => {
    navigate(`/${encodedId}`);
  }, [navigate, encodedId]);

  return (
    <div
      className="cursor-pointer"
      onClick={handleNavigate}
    >
      {/* Reply context */}
      {isReply && replyToPubkey && (
        <ReplyContext pubkey={replyToPubkey} />
      )}

      {/* Author row */}
      <div className="flex items-center gap-3">
        <Link to={`/${npub}`} className="shrink-0" onClick={(e) => e.stopPropagation()}>
          <Avatar className="size-11">
            <AvatarImage src={metadata?.picture} alt={displayName} />
            <AvatarFallback className="bg-primary/20 text-primary text-sm">
              {displayName[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </Link>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Link
              to={`/${npub}`}
              className="font-bold text-[15px] hover:underline truncate"
              onClick={(e) => e.stopPropagation()}
            >
              {displayName}
            </Link>
            {metadata?.bot && (
              <span className="text-xs text-primary shrink-0" title="Bot account">🤖</span>
            )}
          </div>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            {nip05 && <span className="truncate">@{nip05}</span>}
            {nip05 && <span className="shrink-0">·</span>}
            <span className="shrink-0">{timeAgo(event.created_at)}</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mt-2">
        <NoteContent event={event} className="text-[15px] leading-relaxed" />
      </div>

      {/* Images */}
      {images.length > 0 && (
        <div
          className={cn(
            'mt-3 rounded-2xl overflow-hidden border border-border',
            images.length > 1 && 'grid grid-cols-2 gap-0.5',
          )}
        >
          {images.slice(0, 4).map((url, i) => (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={url}
                alt=""
                className="w-full h-auto max-h-[400px] object-cover"
                loading="lazy"
              />
            </a>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <ActionButtons event={event} stats={stats} onReply={() => setReplyOpen(true)} onMore={() => setMoreMenuOpen(true)} />

      <NoteMoreMenu event={event} open={moreMenuOpen} onOpenChange={setMoreMenuOpen} />
      <ReplyComposeModal event={event} open={replyOpen} onOpenChange={setReplyOpen} />
    </div>
  );
}

// ──────────────────────────────────────
// Action Buttons Row: reply, repost, react, zap, more
// ──────────────────────────────────────
function ActionButtons({
  event,
  stats,
  onReply,
  onMore,
}: {
  event: NostrEvent;
  stats?: { replies?: number; reposts?: number; reactions?: number; zapAmount?: number } | null;
  onReply: () => void;
  onMore: () => void;
}) {
  return (
    <div className="flex items-center gap-6 mt-3 -ml-2 mb-1">
      <button
        className="flex items-center gap-1.5 p-2 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
        title="Reply"
        onClick={(e) => { e.stopPropagation(); onReply(); }}
      >
        <MessageCircle className="size-[18px]" />
        {stats?.replies ? <span className="text-sm tabular-nums">{stats.replies}</span> : null}
      </button>

      <button
        className="flex items-center gap-1.5 p-2 rounded-full text-muted-foreground hover:text-green-500 hover:bg-green-500/10 transition-colors"
        title="Repost"
        onClick={(e) => e.stopPropagation()}
      >
        <Repeat2 className="size-[18px]" />
        {stats?.reposts ? <span className="text-sm tabular-nums">{stats.reposts}</span> : null}
      </button>

      <ReactionButton
        eventId={event.id}
        eventPubkey={event.pubkey}
        eventKind={event.kind}
        reactionCount={stats?.reactions}
      />

      <button
        className="flex items-center gap-1.5 p-2 rounded-full text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 transition-colors"
        title="Zap"
        onClick={(e) => e.stopPropagation()}
      >
        <Zap className="size-[18px]" />
        {stats?.zapAmount ? <span className="text-sm tabular-nums">{formatSats(stats.zapAmount)}</span> : null}
      </button>

      <button
        className="p-2 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
        title="More"
        onClick={(e) => { e.stopPropagation(); onMore(); }}
      >
        <MoreHorizontal className="size-[18px]" />
      </button>
    </div>
  );
}

// ──────────────────────────────────────
// Reply Context: "Replying to @{name} and @{name}"
// ──────────────────────────────────────
function ReplyContext({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const name = author.data?.metadata?.name || genUserName(pubkey);

  return (
    <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">
      <span>Replying to</span>
      <Link
        to={`/${nip19.npubEncode(pubkey)}`}
        className="text-primary hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        @{name}
      </Link>
    </div>
  );
}

// ──────────────────────────────────────
// Skeleton Loader
// ──────────────────────────────────────
function NotificationSkeleton() {
  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-2 mb-3">
        <Skeleton className="size-4 rounded-full" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="flex items-center gap-3 mb-2">
        <Skeleton className="size-11 rounded-full" />
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-36" />
        </div>
      </div>
      <div className="space-y-2 mt-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      <div className="flex gap-8 mt-3">
        <Skeleton className="h-4 w-8" />
        <Skeleton className="h-4 w-8" />
        <Skeleton className="h-4 w-8" />
        <Skeleton className="h-4 w-8" />
      </div>
    </div>
  );
}
