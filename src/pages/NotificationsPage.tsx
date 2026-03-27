import { useState, useMemo, useEffect, useCallback } from 'react';
import { useInView } from 'react-intersection-observer';
import { useSeoMeta } from '@unhead/react';
import { useQueryClient } from '@tanstack/react-query';
import { Zap, AtSign, MessageSquare, Loader2, Award, Check, Mail } from 'lucide-react';
import { RepostIcon } from '@/components/icons/RepostIcon';
import { Link, useNavigate } from 'react-router-dom';
import { PullToRefresh } from '@/components/PullToRefresh';
import { useAppContext } from '@/hooks/useAppContext';

import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { NoteCard } from '@/components/NoteCard';
import { SubHeaderBar } from '@/components/SubHeaderBar';
import { TabButton } from '@/components/TabButton';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import { useEvent } from '@/hooks/useEvent';
import type { NostrEvent } from '@nostrify/nostrify';
import { useNotifications, type GroupedNotificationItem, type NotificationItem } from '@/hooks/useNotifications';
import { useMuteList } from '@/hooks/useMuteList';
import { isEventMuted } from '@/lib/muteHelpers';
import { genUserName } from '@/lib/genUserName';
import { getAvatarShape, emojiAvatarBorderStyle } from '@/lib/avatarShape';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { formatNumber } from '@/lib/formatNumber';
import { cn } from '@/lib/utils';
import { ProfileHoverCard } from '@/components/ProfileHoverCard';
import { ReactionEmoji, EmojifiedText } from '@/components/CustomEmoji';
import { useAcceptBadge } from '@/hooks/useAcceptBadge';
import { useProfileBadges } from '@/hooks/useProfileBadges';
import { useBadgeDefinitions } from '@/hooks/useBadgeDefinitions';
import { BADGE_DEFINITION_KIND } from '@/lib/badgeUtils';
import { LETTER_KIND, type Letter } from '@/lib/letterTypes';
import { EnvelopeCard } from '@/components/letter/EnvelopeCard';
import { Button } from '@/components/ui/button';
import { ARC_OVERHANG_PX } from '@/components/ArcBackground';
import { useLayoutOptions } from '@/contexts/LayoutContext';

type NotificationTab = 'all' | 'mentions';

export function NotificationsPage() {
  const { config } = useAppContext();

  useSeoMeta({
    title: `Notifications | ${config.appName}`,
    description: 'Your Nostr notifications',
  });

  useLayoutOptions({ hasSubHeader: true });

  const [activeTab, setActiveTab] = useState<NotificationTab>('all');
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const {
    groupedItems,
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
    if (hasNextPage && !isFetchingNextPage && groupedItems.length > 0 && groupedItems.length <= 20) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, groupedItems.length, fetchNextPage]);

  const filteredGroups = useMemo(() => {
    let filtered = groupedItems;
    // Filter out notifications from muted users/content
    if (muteItems.length > 0) {
      filtered = filtered.filter((group) =>
        group.actors.every((item) => !isEventMuted(item.event, muteItems)),
      );
    }
    if (activeTab === 'mentions') {
      filtered = filtered.filter((group) => group.kind === 1 || group.kind === 1111);
    }
    return filtered;
  }, [groupedItems, activeTab, muteItems]);

  const tabs: { key: NotificationTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'mentions', label: 'Mentions' },
  ];

  return (
    <main className="">
      {/* Tab bar */}
      <SubHeaderBar>
        {tabs.map(({ key, label }) => (
          <TabButton
            key={key}
            label={label}
            active={activeTab === key}
            onClick={() => setActiveTab(key)}
            className="sidebar:py-5 sidebar:font-semibold"
          />
        ))}
      </SubHeaderBar>

      {/* Spacer for the arc overhang so content doesn't overlap the arc */}
      <div style={{ height: ARC_OVERHANG_PX }} />

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
        ) : filteredGroups.length > 0 ? (
          <div>
            {filteredGroups.map((group) => (
              <GroupedNotificationView
                key={group.key}
                group={group}
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

/** Renders one condensed group. Delegates to type-specific components. */
function GroupedNotificationView({ group }: { group: GroupedNotificationItem }) {
  const solo = group.actors.length === 1;

  switch (group.kind) {
    case 7:
      return solo
        ? <LikeNotification item={group.actors[0]} isNew={group.isNew} />
        : <LikeNotificationGroup group={group} />;
    case 6:
    case 16:
      return solo
        ? <RepostNotification item={group.actors[0]} isNew={group.isNew} />
        : <RepostNotificationGroup group={group} />;
    case 9735:
      return solo
        ? <ZapNotification item={group.actors[0]} isNew={group.isNew} />
        : <ZapNotificationGroup group={group} />;
    case 1:
      return <MentionNotification item={group.actors[0]} isNew={group.isNew} />;
    case 1111:
      return <CommentNotification item={group.actors[0]} isNew={group.isNew} />;
    case 8:
      return solo
        ? <BadgeAwardNotification item={group.actors[0]} isNew={group.isNew} />
        : <BadgeAwardNotificationGroup group={group} />;
    case LETTER_KIND:
      return <LetterNotification item={group.actors[0]} isNew={group.isNew} />;
    default:
      return null;
  }
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
 * Uses the pre-fetched event from the group, falling back to useEvent.
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
// Actor avatars row for condensed groups
// ──────────────────────────────────────

/** Shows up to MAX_SHOWN actor avatars with an overflow "+N" badge. */
const MAX_SHOWN = 5;

function ActorAvatars({ actors }: { actors: NotificationItem[] }) {
  const shown = actors.slice(0, MAX_SHOWN);
  const overflow = actors.length - MAX_SHOWN;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {shown.map((item) => (
        <ActorAvatar key={item.event.id} pubkey={item.event.pubkey} />
      ))}
      {overflow > 0 && (
        <span className="text-xs text-muted-foreground font-medium pl-0.5">
          +{overflow} more
        </span>
      )}
    </div>
  );
}

function ActorAvatar({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const name = metadata?.name ?? genUserName(pubkey);
  const profileUrl = useProfileUrl(pubkey, metadata);
  const shape = getAvatarShape(metadata);
  const isEmojiShape = !!shape;

  return (
    <ProfileHoverCard pubkey={pubkey} asChild>
      <Link
        to={profileUrl}
        title={name}
        className="shrink-0"
        style={isEmojiShape ? emojiAvatarBorderStyle : undefined}
      >
        <Avatar className={cn("size-7", !isEmojiShape && "ring-2 ring-background")} shape={shape}>
          {metadata?.picture && <AvatarImage src={metadata.picture} alt={name} />}
          <AvatarFallback className="text-[10px]">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
      </Link>
    </ProfileHoverCard>
  );
}

// ──────────────────────────────────────
// Condensed group header: avatars + action text
// ──────────────────────────────────────

function GroupHeader({
  actors,
  icon,
  action,
}: {
  actors: NotificationItem[];
  icon: React.ReactNode;
  action: string;
}) {
  // Build a human-readable subject line from the first 2 actor names
  const firstActor = actors[0];
  const secondActor = actors[1];
  const totalCount = actors.length;

  const firstName = useActorName(firstActor.event.pubkey);
  const secondName = useActorName(secondActor?.event.pubkey ?? '');

  let subject: React.ReactNode;

  if (totalCount === 1) {
    subject = <ActorLink pubkey={firstActor.event.pubkey} name={firstName} />;
  } else if (totalCount === 2) {
    subject = (
      <>
        <ActorLink pubkey={firstActor.event.pubkey} name={firstName} />
        {' and '}
        <ActorLink pubkey={secondActor.event.pubkey} name={secondName} />
      </>
    );
  } else {
    subject = (
      <>
        <ActorLink pubkey={firstActor.event.pubkey} name={firstName} />
        {` and ${totalCount - 1} others`}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-2 px-4 pt-3 pb-2">
      <ActorAvatars actors={actors} />
      <div className="flex items-center gap-1.5 text-sm flex-wrap">
        <span className="shrink-0 text-muted-foreground">{icon}</span>
        <span className="font-medium">{subject}</span>
        <span className="text-muted-foreground">{action}</span>
      </div>
    </div>
  );
}

/** Helper hook to get a display name for a pubkey. */
function useActorName(pubkey: string): string {
  const author = useAuthor(pubkey || 'dummy');
  return author.data?.metadata?.name ?? genUserName(pubkey || 'dummy');
}

function ActorLink({ pubkey, name }: { pubkey: string; name: string }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const profileUrl = useProfileUrl(pubkey, metadata);

  return (
    <ProfileHoverCard pubkey={pubkey} asChild>
      <Link to={profileUrl} className="font-bold hover:underline">
        {author.data?.event ? (
          <EmojifiedText tags={author.data.event.tags}>{name}</EmojifiedText>
        ) : name}
      </Link>
    </ProfileHoverCard>
  );
}

// ──────────────────────────────────────
// Like Notification (single actor)
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
// Repost Notification (single actor)
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
// Zap Notification (single actor)
// ──────────────────────────────────────
function ZapNotification({ item, isNew }: { item: NotificationItem; isNew: boolean }) {
  const { event } = item;

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

  const amountLabel = zapAmount > 0 ? ` ${formatNumber(zapAmount)} sats` : '';

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
// Like Notification (grouped)
// ──────────────────────────────────────
function LikeNotificationGroup({ group }: { group: GroupedNotificationItem }) {
  // Use the first actor's reaction emoji as the icon
  const firstEvent = group.actors[0].event;
  return (
    <NotificationWrapper isNew={group.isNew}>
      <GroupHeader
        actors={group.actors}
        icon={
          <span className="text-base leading-none size-4 flex items-center justify-center">
            <ReactionEmoji content={firstEvent.content.trim()} tags={firstEvent.tags} className="inline-block h-4 w-4" />
          </span>
        }
        action="reacted to your post"
      />
      <ReferencedNoteCard item={group.actors[0]} />
    </NotificationWrapper>
  );
}

// ──────────────────────────────────────
// Repost Notification (grouped)
// ──────────────────────────────────────
function RepostNotificationGroup({ group }: { group: GroupedNotificationItem }) {
  return (
    <NotificationWrapper isNew={group.isNew}>
      <GroupHeader
        actors={group.actors}
        icon={<RepostIcon className="size-4 text-accent" />}
        action="reposted your note"
      />
      <ReferencedNoteCard item={group.actors[0]} />
    </NotificationWrapper>
  );
}

// ──────────────────────────────────────
// Zap Notification (grouped)
// ──────────────────────────────────────
function ZapNotificationGroup({ group }: { group: GroupedNotificationItem }) {
  // Sum zap amounts across all actors in the group
  const totalSats = useMemo(() => {
    let total = 0;
    for (const item of group.actors) {
      const event = item.event;
      const amountTag = event.tags.find(([name]) => name === 'amount');
      if (amountTag?.[1]) {
        const msats = parseInt(amountTag[1], 10);
        if (!isNaN(msats) && msats > 0) { total += Math.floor(msats / 1000); continue; }
      }
      const descTag = event.tags.find(([name]) => name === 'description');
      if (descTag?.[1]) {
        try {
          const zapRequest = JSON.parse(descTag[1]);
          const reqAmountTag = zapRequest.tags?.find(([name]: [string]) => name === 'amount');
          if (reqAmountTag?.[1]) {
            const msats = parseInt(reqAmountTag[1], 10);
            if (!isNaN(msats) && msats > 0) { total += Math.floor(msats / 1000); continue; }
          }
        } catch { /* ignore */ }
      }
    }
    return total;
  }, [group.actors]);

  // Extract sender pubkeys from zap receipts to use as the actor pubkeys
  const zapActors = useMemo<NotificationItem[]>(() => {
    return group.actors.map((item) => {
      const event = item.event;
      let senderPubkey = event.pubkey;
      const pTag = event.tags.find(([name]) => name === 'P');
      if (pTag?.[1]) { senderPubkey = pTag[1]; }
      else {
        const descTag = event.tags.find(([name]) => name === 'description');
        if (descTag?.[1]) {
          try {
            const zapRequest = JSON.parse(descTag[1]);
            if (zapRequest.pubkey) senderPubkey = zapRequest.pubkey;
          } catch { /* ignore */ }
        }
      }
      return { ...item, event: { ...event, pubkey: senderPubkey } };
    });
  }, [group.actors]);

  const amountLabel = totalSats > 0 ? ` ${formatNumber(totalSats)} sats` : '';

  return (
    <NotificationWrapper isNew={group.isNew}>
      <GroupHeader
        actors={zapActors}
        icon={<Zap className="size-4 text-amber-500 fill-amber-500" />}
        action={`zapped you${amountLabel}`}
      />
      <ReferencedNoteCard item={group.actors[0]} />
    </NotificationWrapper>
  );
}

// ──────────────────────────────────────
// Mention Notification (always standalone)
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
// Comment Notification (kind 1111, always standalone)
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
// Letter Notification (kind 8211, always standalone)
// ──────────────────────────────────────
function LetterNotification({ item, isNew }: { item: NotificationItem; isNew: boolean }) {
  const navigate = useNavigate();

  const letter = useMemo<Letter>(() => ({
    event: item.event,
    sender: item.event.pubkey,
    recipient: item.event.tags.find(([name]) => name === 'p')?.[1] ?? '',
    decrypted: false,
    timestamp: item.event.created_at,
  }), [item.event]);

  return (
    <NotificationWrapper isNew={isNew}>
      <div className="px-4 pt-3">
        <NotificationHeader
          actorPubkey={item.event.pubkey}
          icon={<Mail className="size-4 text-primary" />}
          action="sent you a letter"
        />
      </div>
      <div className="px-4 pb-3 pt-1">
        <div className="max-w-[160px]">
          <EnvelopeCard
            letter={letter}
            mode="inbox"
            index={0}
            onClick={() => navigate('/letters')}
          />
        </div>
      </div>
    </NotificationWrapper>
  );
}

// ──────────────────────────────────────
// Badge Award helpers
// ──────────────────────────────────────

/** Extract pubkey and identifier from a kind 8 award event's `a` tag. */
function parseBadgeATag(event: NostrEvent): { pubkey: string; identifier: string } | undefined {
  const aVal = event.tags.find(([n, v]) => n === 'a' && v?.startsWith(`${BADGE_DEFINITION_KIND}:`))?.[1];
  if (!aVal) return undefined;
  const parts = aVal.split(':');
  if (parts.length < 3 || !parts[1] || !parts[2]) return undefined;
  return { pubkey: parts[1], identifier: parts.slice(2).join(':') };
}

/** Turn a d-tag slug like "first-post" into "First Post". */
function unslugify(slug: string): string {
  return slug
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Hook: resolve the display name for a single badge award event. */
function useBadgeAwardName(awardEvent: NostrEvent): string | undefined {
  const parsed = useMemo(() => parseBadgeATag(awardEvent), [awardEvent]);
  const refs = useMemo(() => (parsed ? [parsed] : []), [parsed]);
  const { badgeMap } = useBadgeDefinitions(refs);

  if (!parsed) return undefined;
  const aTag = `${BADGE_DEFINITION_KIND}:${parsed.pubkey}:${parsed.identifier}`;
  return badgeMap.get(aTag)?.name || unslugify(parsed.identifier);
}

// ──────────────────────────────────────
// Accept Badge Button (shared by single and grouped badge notifications)
// ──────────────────────────────────────
function AcceptBadgeButton({ awardEvent }: { awardEvent: NostrEvent }) {
  const { user } = useCurrentUser();
  const { refs } = useProfileBadges(user?.pubkey);
  const { mutate: acceptBadge, isPending, isSuccess } = useAcceptBadge();

  const aTag = awardEvent.tags.find(([n, v]) => n === 'a' && v?.startsWith('30009:'))?.[1];

  // Check if already accepted
  const alreadyAccepted = refs.some((r) => r.aTag === aTag) || isSuccess;

  if (!aTag || !user) return null;

  if (alreadyAccepted) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Check className="size-3" />
        Accepted
      </span>
    );
  }

  return (
    <Button
      size="sm"
      variant="outline"
      className="h-7 px-2.5 text-xs font-medium gap-1 transition-colors hover:bg-primary hover:text-primary-foreground"
      onClick={() => acceptBadge({ aTag, awardEventId: awardEvent.id })}
      disabled={isPending}
    >
      {isPending ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <>
          <Award className="size-3" />
          Accept
        </>
      )}
    </Button>
  );
}

// ──────────────────────────────────────
// Badge Award Notification (single actor)
// ──────────────────────────────────────
function BadgeAwardNotification({ item, isNew }: { item: NotificationItem; isNew: boolean }) {
  const badgeName = useBadgeAwardName(item.event);

  return (
    <NotificationWrapper isNew={isNew}>
      <div className="px-4 pt-3 pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <NotificationHeader
              actorPubkey={item.event.pubkey}
              icon={<Award className="size-4 text-primary" />}
              action={badgeName ? `awarded you the "${badgeName}" badge` : 'awarded you a badge'}
            />
          </div>
          <div className="shrink-0">
            <AcceptBadgeButton awardEvent={item.event} />
          </div>
        </div>
      </div>
    </NotificationWrapper>
  );
}

// ──────────────────────────────────────
// Badge Award Notification (grouped)
// ──────────────────────────────────────
function BadgeAwardNotificationGroup({ group }: { group: GroupedNotificationItem }) {
  const badgeRefs = useMemo(() => {
    const refs: Array<{ pubkey: string; identifier: string }> = [];
    for (const actor of group.actors) {
      const parsed = parseBadgeATag(actor.event);
      if (parsed) refs.push(parsed);
    }
    return refs;
  }, [group.actors]);

  const { badgeMap } = useBadgeDefinitions(badgeRefs);

  return (
    <NotificationWrapper isNew={group.isNew}>
      <GroupHeader
        actors={group.actors}
        icon={<Award className="size-4 text-primary" />}
        action="awarded you badges"
      />
      <div className="px-4 pb-3 space-y-2">
        {group.actors.map((actor) => {
          const parsed = parseBadgeATag(actor.event);
          const aTag = parsed ? `${BADGE_DEFINITION_KIND}:${parsed.pubkey}:${parsed.identifier}` : undefined;
          const badgeName = aTag ? badgeMap.get(aTag)?.name : undefined;
          const displayName = badgeName || (parsed ? unslugify(parsed.identifier) : undefined);

          return (
            <div key={actor.event.id} className="flex items-center justify-between gap-2">
              {displayName && (
                <span className="text-xs text-muted-foreground truncate">
                  {displayName}
                </span>
              )}
              <div className="shrink-0 ml-auto">
                <AcceptBadgeButton awardEvent={actor.event} />
              </div>
            </div>
          );
        })}
      </div>
    </NotificationWrapper>
  );
}

// ──────────────────────────────────────
// Notification Header: icon + actor name + action (used for standalone items)
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
