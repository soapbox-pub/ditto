import { useState, useMemo, useEffect, useCallback } from 'react';
import { useInView } from 'react-intersection-observer';
import { useSeoMeta } from '@unhead/react';
import { useQueryClient } from '@tanstack/react-query';
import { Zap, AtSign, MessageSquare, Loader2 } from 'lucide-react';
import { RepostIcon } from '@/components/icons/RepostIcon';
import { Link } from 'react-router-dom';
import { PullToRefresh } from '@/components/PullToRefresh';
import { useAppContext } from '@/hooks/useAppContext';

import { Skeleton } from '@/components/ui/skeleton';
import { NoteCard } from '@/components/NoteCard';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import { useEvent } from '@/hooks/useEvent';
import { useNotifications, type NotificationItem } from '@/hooks/useNotifications';
import { useMuteList } from '@/hooks/useMuteList';
import { isEventMuted } from '@/lib/muteHelpers';
import { genUserName } from '@/lib/genUserName';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { cn } from '@/lib/utils';
import { ProfileHoverCard } from '@/components/ProfileHoverCard';
import { ReactionEmoji, EmojifiedText } from '@/components/CustomEmoji';

type NotificationTab = 'all' | 'mentions';

export function NotificationsPage() {
  const { config } = useAppContext();

  useSeoMeta({
    title: `Notifications | ${config.appName}`,
    description: 'Your Nostr notifications',
  });

  const [activeTab, setActiveTab] = useState<NotificationTab>('all');
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const {
    items,
    newNotificationIds,
    isLoading,
    hasFetched,
    markAsRead,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useNotifications();
  const { muteItems } = useMuteList();

  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['notifications', user?.pubkey ?? ''] });
  }, [queryClient, user?.pubkey]);

  // Mark notifications as read when user visits the page
  useEffect(() => {
    if (!user || newNotificationIds.size === 0) return;

    const timer = setTimeout(() => {
      markAsRead();
    }, 1000);

    return () => clearTimeout(timer);
  }, [user, newNotificationIds.size, markAsRead]);

  // Intersection observer for infinite scroll
  const { ref: scrollRef, inView } = useInView({
    threshold: 0,
    rootMargin: '400px',
  });

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Auto-fetch page 2 as soon as page 1 arrives for smoother scrolling
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && items.length > 0 && items.length <= 20) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, items.length, fetchNextPage]);

  const filteredItems = useMemo(() => {
    let filtered = items;
    // Filter out notifications from muted users/content
    if (muteItems.length > 0) {
      filtered = filtered.filter((item) => !isEventMuted(item.event, muteItems));
    }
    if (activeTab === 'mentions') {
      filtered = filtered.filter((item) => item.event.kind === 1 || item.event.kind === 1111);
    }
    return filtered;
  }, [items, activeTab, muteItems]);

  const tabs: { key: NotificationTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'mentions', label: 'Mentions' },
  ];

  return (
    <main className="">
      {/* Tab bar */}
      <div className="flex border-b border-border sticky top-mobile-bar sidebar:top-0 bg-background/80 backdrop-blur-md z-10">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              'flex-1 py-3.5 sidebar:py-5 text-sm font-medium sidebar:font-semibold transition-colors relative hover:bg-secondary/40',
              activeTab === key ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {label}
            {activeTab === key && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-1 sidebar:h-[3px] bg-primary rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <PullToRefresh onRefresh={handleRefresh}>
        {!user ? (
          <div className="py-16 text-center text-muted-foreground">
            Log in to see your notifications.
          </div>
        ) : isLoading || !hasFetched ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 4 }).map((_, i) => (
              <NotificationSkeleton key={i} />
            ))}
          </div>
        ) : filteredItems.length > 0 ? (
          <div>
            {filteredItems.map((item) => (
              <NotificationItemView
                key={item.event.id}
                item={item}
                isNew={newNotificationIds.has(item.event.id)}
              />
            ))}
            {hasNextPage && (
              <div ref={scrollRef} className="py-4">
                {isFetchingNextPage && (
                  <div className="flex justify-center">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="py-16 text-center text-muted-foreground">
            No notifications yet.
          </div>
        )}
      </PullToRefresh>
    </main>
  );
}

/** Determines the type of notification and renders accordingly. */
function NotificationItemView({ item, isNew }: { item: NotificationItem; isNew: boolean }) {
  switch (item.event.kind) {
    case 7:
      return <LikeNotification item={item} isNew={isNew} />;
    case 6:
    case 16:
      return <RepostNotification item={item} isNew={isNew} />;
    case 9735:
      return <ZapNotification item={item} isNew={isNew} />;
    case 1:
      return <MentionNotification item={item} isNew={isNew} />;
    case 1111:
      return <CommentNotification item={item} isNew={isNew} />;
    default:
      return null;
  }
}

/** Formats a sats amount into a compact human-readable string. */
function formatSats(sats: number): string {
  if (sats >= 1_000_000) return `${(sats / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (sats >= 1_000) return `${(sats / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return sats.toString();
}

/** Wrapper that adds the new-notification indicator. */
function NotificationWrapper({ isNew, children }: { isNew: boolean; children: React.ReactNode }) {
  return (
    <div className={cn('relative border-b border-border', isNew && 'bg-primary/5')}>
      {isNew && (
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary z-10" />
      )}
      {children}
    </div>
  );
}

/**
 * Renders the referenced event as a NoteCard.
 * Uses the pre-fetched event from the notification item, falling back to useEvent.
 */
function ReferencedNoteCard({ item }: { item: NotificationItem }) {
  const referencedEventId = item.event.tags.findLast(([name]) => name === 'e')?.[1];
  // Fall back to useEvent if the batch fetch didn't find it
  const { data: fetchedEvent } = useEvent(
    item.referencedEvent ? undefined : referencedEventId,
  );
  const event = item.referencedEvent ?? fetchedEvent;

  if (!event) return null;

  return <NoteCard event={event} className="border-0" />;
}

// ──────────────────────────────────────
// Like Notification
// ──────────────────────────────────────
function LikeNotification({ item, isNew }: { item: NotificationItem; isNew: boolean }) {
  return (
    <NotificationWrapper isNew={isNew}>
      <div className="px-4 pt-3">
        <NotificationHeader
          actorPubkey={item.event.pubkey}
          icon={
            <span className="text-base leading-none size-4 flex items-center justify-center">
              <ReactionEmoji content={item.event.content.trim()} tags={item.event.tags} className="inline-block h-4 w-4" />
            </span>
          }
          action="reacted to your post"
        />
      </div>
      <ReferencedNoteCard item={item} />
    </NotificationWrapper>
  );
}

// ──────────────────────────────────────
// Repost Notification
// ──────────────────────────────────────
function RepostNotification({ item, isNew }: { item: NotificationItem; isNew: boolean }) {
  return (
    <NotificationWrapper isNew={isNew}>
      <div className="px-4 pt-3">
        <NotificationHeader
          actorPubkey={item.event.pubkey}
          icon={<RepostIcon className="size-4 text-accent" />}
          action="reposted your note"
        />
      </div>
      <ReferencedNoteCard item={item} />
    </NotificationWrapper>
  );
}

// ──────────────────────────────────────
// Zap Notification
// ──────────────────────────────────────
function ZapNotification({ item, isNew }: { item: NotificationItem; isNew: boolean }) {
  const { event } = item;

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
    <NotificationWrapper isNew={isNew}>
      <div className="px-4 pt-3">
        <NotificationHeader
          actorPubkey={senderPubkey}
          icon={<Zap className="size-4 text-amber-500 fill-amber-500" />}
          action={`zapped you${amountLabel}`}
        />
      </div>
      <ReferencedNoteCard item={item} />
    </NotificationWrapper>
  );
}

// ──────────────────────────────────────
// Mention Notification
// ──────────────────────────────────────
function MentionNotification({ item, isNew }: { item: NotificationItem; isNew: boolean }) {
  return (
    <NotificationWrapper isNew={isNew}>
      <div className="px-4 pt-3">
        <NotificationHeader
          actorPubkey={item.event.pubkey}
          icon={<AtSign className="size-4 text-primary" />}
          action="mentioned you"
        />
      </div>
      <NoteCard event={item.event} className="border-0" />
    </NotificationWrapper>
  );
}

// ──────────────────────────────────────
// Comment Notification (kind 1111)
// ──────────────────────────────────────
function CommentNotification({ item, isNew }: { item: NotificationItem; isNew: boolean }) {
  // If the parent kind tag is "1111", this is a reply to a comment; otherwise it's a
  // top-level comment on a piece of content the user authored.
  const parentKind = item.event.tags.find(([name]) => name === 'k')?.[1];
  const action = parentKind === '1111' ? 'replied to your comment' : 'commented on your post';

  return (
    <NotificationWrapper isNew={isNew}>
      <div className="px-4 pt-3">
        <NotificationHeader
          actorPubkey={item.event.pubkey}
          icon={<MessageSquare className="size-4 text-primary" />}
          action={action}
        />
      </div>
      <NoteCard event={item.event} className="border-0" />
    </NotificationWrapper>
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
  const profileUrl = useProfileUrl(actorPubkey, metadata);

  if (author.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm mb-2">
        <span className="shrink-0">{icon}</span>
        <Skeleton className="h-4 w-24" />
        <span className="text-muted-foreground shrink-0">{action}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm mb-2">
      <span className="shrink-0">{icon}</span>
      <ProfileHoverCard pubkey={actorPubkey} asChild>
        <Link to={profileUrl} className="font-bold hover:underline truncate">
          {author.data?.event ? (
            <EmojifiedText tags={author.data.event.tags}>{displayName}</EmojifiedText>
          ) : displayName}
        </Link>
      </ProfileHoverCard>
      <span className="text-muted-foreground shrink-0">{action}</span>
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
