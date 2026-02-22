import { useState, useMemo, useEffect } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Zap, AtSign } from 'lucide-react';
import { RepostIcon } from '@/components/icons/RepostIcon';
import { Link } from 'react-router-dom';
import type { NostrEvent } from '@nostrify/nostrify';

import { Skeleton } from '@/components/ui/skeleton';
import { NoteCard } from '@/components/NoteCard';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import { useEvent } from '@/hooks/useEvent';
import { useNotifications } from '@/hooks/useNotifications';
import { useMuteList } from '@/hooks/useMuteList';
import { isEventMuted } from '@/lib/muteHelpers';
import { genUserName } from '@/lib/genUserName';
import { getProfileUrl } from '@/lib/profileUrl';
import { cn } from '@/lib/utils';
import { ProfileHoverCard } from '@/components/ProfileHoverCard';
import { ReactionEmoji, EmojifiedText } from '@/components/CustomEmoji';

type NotificationTab = 'all' | 'mentions';

export function NotificationsPage() {
  useSeoMeta({
    title: 'Notifications | Mew',
    description: 'Your Nostr notifications',
  });

  const [activeTab, setActiveTab] = useState<NotificationTab>('all');
  const { user } = useCurrentUser();
  const { notifications, newNotifications, isLoading, hasFetched, markAsRead } = useNotifications();
  const { muteItems } = useMuteList();

  // Mark notifications as read when user visits the page
  useEffect(() => {
    // Only mark as read if there are actually NEW notifications
    if (!user || newNotifications.length === 0) return;

    // Mark as read after a short delay to ensure user actually sees them
    const timer = setTimeout(() => {
      markAsRead();
    }, 1000);

    return () => clearTimeout(timer);
  }, [user, newNotifications.length, markAsRead]);

  const filteredNotifications = useMemo(() => {
    let filtered = notifications;
    // Filter out notifications from muted users/content
    if (muteItems.length > 0) {
      filtered = filtered.filter((e) => !isEventMuted(e, muteItems));
    }
    if (activeTab === 'mentions') {
      filtered = filtered.filter((e) => e.kind === 1);
    }
    return filtered;
  }, [notifications, activeTab, muteItems]);

  // Create a set of new notification IDs for quick lookup
  const newNotificationIds = useMemo(
    () => new Set(newNotifications.map((e) => e.id)),
    [newNotifications]
  );

  const tabs: { key: NotificationTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'mentions', label: 'Mentions' },
  ];

  return (
      <main className="flex-1 min-w-0 sidebar:max-w-[600px] sidebar:border-l xl:border-r border-border min-h-screen">
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
        ) : filteredNotifications.length > 0 ? (
          <div className="divide-y divide-border">
            {filteredNotifications.map((event) => (
              <NotificationItem
                key={event.id}
                event={event}
                isNew={newNotificationIds.has(event.id)}
              />
            ))}
          </div>
        ) : (
          <div className="py-16 text-center text-muted-foreground">
            No notifications yet.
          </div>
        )}
      </main>
  );
}

/** Determines the type of notification and renders accordingly. */
function NotificationItem({ event, isNew }: { event: NostrEvent; isNew: boolean }) {
  switch (event.kind) {
    case 7:
      return <LikeNotification event={event} isNew={isNew} />;
    case 6:
      return <RepostNotification event={event} isNew={isNew} />;
    case 9735:
      return <ZapNotification event={event} isNew={isNew} />;
    case 1:
      return <MentionNotification event={event} isNew={isNew} />;
    default:
      return null;
  }
}

/** Gets the referenced event ID from an event's tags. */
function getReferencedEventId(event: NostrEvent): string | undefined {
  const eTag = event.tags.find(([name]) => name === 'e');
  return eTag?.[1];
}

/** Formats a sats amount into a compact human-readable string. */
function formatSats(sats: number): string {
  if (sats >= 1_000_000) return `${(sats / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (sats >= 1_000) return `${(sats / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return sats.toString();
}

/** Wrapper that adds the new-notification indicator and renders the referenced post. */
function NotificationWrapper({ isNew, children }: { isNew: boolean; children: React.ReactNode }) {
  return (
    <div className={cn('relative', isNew && 'bg-primary/5')}>
      {isNew && (
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
      )}
      {children}
    </div>
  );
}

// ──────────────────────────────────────
// Like Notification
// ──────────────────────────────────────
function LikeNotification({ event, isNew }: { event: NostrEvent; isNew: boolean }) {
  const referencedEventId = getReferencedEventId(event);
  const { data: referencedEvent } = useEvent(referencedEventId);

  return (
    <NotificationWrapper isNew={isNew}>
      <div className="px-4 pt-3">
        <NotificationHeader
          actorPubkey={event.pubkey}
          icon={
            <span className="text-base leading-none size-4 flex items-center justify-center">
              <ReactionEmoji content={event.content.trim()} tags={event.tags} className="inline-block h-4 w-4" />
            </span>
          }
          action="reacted to your post"
        />
      </div>
      {referencedEvent && (
        <NoteCard event={referencedEvent} className="border-0" />
      )}
    </NotificationWrapper>
  );
}

// ──────────────────────────────────────
// Repost Notification
// ──────────────────────────────────────
function RepostNotification({ event, isNew }: { event: NostrEvent; isNew: boolean }) {
  const referencedEventId = getReferencedEventId(event);
  const { data: referencedEvent } = useEvent(referencedEventId);

  return (
    <NotificationWrapper isNew={isNew}>
      <div className="px-4 pt-3">
        <NotificationHeader
          actorPubkey={event.pubkey}
          icon={<RepostIcon className="size-4 text-green-500" />}
          action="reposted your note"
        />
      </div>
      {referencedEvent && (
        <NoteCard event={referencedEvent} className="border-0" />
      )}
    </NotificationWrapper>
  );
}

// ──────────────────────────────────────
// Zap Notification
// ──────────────────────────────────────
function ZapNotification({ event, isNew }: { event: NostrEvent; isNew: boolean }) {
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
    <NotificationWrapper isNew={isNew}>
      <div className="px-4 pt-3">
        <NotificationHeader
          actorPubkey={senderPubkey}
          icon={<Zap className="size-4 text-amber-500 fill-amber-500" />}
          action={`zapped you${amountLabel}`}
        />
      </div>
      {referencedEvent && (
        <NoteCard event={referencedEvent} className="border-0" />
      )}
    </NotificationWrapper>
  );
}

// ──────────────────────────────────────
// Mention Notification
// ──────────────────────────────────────
function MentionNotification({ event, isNew }: { event: NostrEvent; isNew: boolean }) {
  return (
    <NotificationWrapper isNew={isNew}>
      <div className="px-4 pt-3">
        <NotificationHeader
          actorPubkey={event.pubkey}
          icon={<AtSign className="size-4 text-primary" />}
          action="mentioned you"
        />
      </div>
      <NoteCard event={event} className="border-0" />
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
  const profileUrl = useMemo(() => getProfileUrl(actorPubkey, metadata), [actorPubkey, metadata]);

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
