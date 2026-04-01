import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Award, Check, Users, Gift, Loader2, MessageCircle, Newspaper } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ComposeBox } from '@/components/ComposeBox';
import { NoteCard } from '@/components/NoteCard';
import { ThreadedReplyList } from '@/components/ThreadedReplyList';
import { ARC_OVERHANG_PX } from '@/components/ArcBackground';
import { SubHeaderBar } from '@/components/SubHeaderBar';
import { TabButton } from '@/components/TabButton';
import { useAuthor } from '@/hooks/useAuthor';
import { useAuthors } from '@/hooks/useAuthors';
import { useToast } from '@/hooks/useToast';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePendingBadges } from '@/hooks/usePendingBadges';
import { useAcceptBadge } from '@/hooks/useAcceptBadge';
import { useComments } from '@/hooks/useComments';
import { useMuteList } from '@/hooks/useMuteList';
import { isEventMuted } from '@/lib/muteHelpers';
import { genUserName } from '@/lib/genUserName';
import { VerifiedNip05Text } from '@/components/Nip05Badge';
import { parseBadgeDefinition } from '@/components/BadgeContent';
import { useCardTilt } from '@/hooks/useCardTilt';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { AwardBadgeDialog } from '@/components/AwardBadgeDialog';
import { NoteMoreMenu } from '@/components/NoteMoreMenu';
import { PostActionBar } from '@/components/PostActionBar';

type DetailTab = 'awarded' | 'feed' | 'comments';

/**
 * Full detail view for a NIP-58 badge definition (kind 30009).
 * Shows the badge image, name, description, issuer, react/repost bar,
 * and tabs for "Awarded To" and "Comments".
 */
export function BadgeDetailContent({ event }: { event: NostrEvent }) {
  const { nostr } = useNostr();
  const { toast } = useToast();
  const { user } = useCurrentUser();
  const acceptBadge = useAcceptBadge();
  const [awardDialogOpen, setAwardDialogOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>('awarded');

  const badge = useMemo(() => parseBadgeDefinition(event), [event]);

  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const avatarShape = getAvatarShape(metadata);
  const displayName = metadata?.name || genUserName(event.pubkey);
  const npub = useMemo(() => nip19.npubEncode(event.pubkey), [event.pubkey]);

  // Query kind 8 badge award events referencing this badge definition
  const badgeATag = badge ? `30009:${event.pubkey}:${badge.identifier}` : '';

  const { pendingBadges } = usePendingBadges(user?.pubkey);
  const pendingForUser = pendingBadges.find((p) => p.aTag === badgeATag);
  const isIssuer = user?.pubkey === event.pubkey;

  const awardsQuery = useQuery({
    queryKey: ['badge-awards', badgeATag],
    queryFn: async () => {
      if (!badgeATag) return [];
      const events = await nostr.query([{
        kinds: [8],
        authors: [event.pubkey],
        '#a': [badgeATag],
        limit: 200,
      }]);
      return events;
    },
    enabled: !!badgeATag,
    staleTime: 2 * 60_000,
  });

  // Extract unique awarded pubkeys
  const awardedPubkeys = useMemo(() => {
    if (!awardsQuery.data) return [];
    const pkSet = new Set<string>();
    for (const awardEvent of awardsQuery.data) {
      for (const tag of awardEvent.tags) {
        if (tag[0] === 'p' && tag[1]) {
          pkSet.add(tag[1]);
        }
      }
    }
    return [...pkSet];
  }, [awardsQuery.data]);

  // Batch-fetch awardee profiles (first 50)
  const previewPubkeys = useMemo(() => awardedPubkeys.slice(0, 50), [awardedPubkeys]);
  const { data: membersMap, isLoading: membersLoading } = useAuthors(previewPubkeys);

  // Comments (NIP-22 kind 1111 on this addressable event)
  const { muteItems } = useMuteList();
  const { data: commentsData, isLoading: commentsLoading } = useComments(event, 500);

  const orderedReplies = useMemo(() => {
    const topLevel = commentsData?.topLevelComments ?? [];
    const filtered = muteItems.length > 0
      ? topLevel.filter((r) => !isEventMuted(r, muteItems))
      : topLevel;
    return [...filtered]
      .sort((a, b) => b.created_at - a.created_at)
      .map((reply) => {
        const directReplies = commentsData?.getDirectReplies(reply.id) ?? [];
        return {
          reply,
          firstSubReply: directReplies[0] as NostrEvent | undefined,
        };
      });
  }, [commentsData, muteItems]);

  if (!badge) return null;

  const heroImage = badge.image
    ?? badge.thumbs.find((t) => t.dimensions === '512x512')?.url
    ?? badge.thumbs[0]?.url;

  return (
    <div>
      {/* Hero badge image with 3D tilt */}
      {heroImage ? (
        <BadgeHero heroImage={heroImage} badgeName={badge.name} />
      ) : (
        <div className="flex items-center justify-center h-[180px]">
          <Award className="size-16 text-primary/20" />
        </div>
      )}

      <div className="px-4 pt-2 pb-3">
        {/* Issuer row */}
        <div className="flex items-center gap-3">
          <Link to={`/${npub}`}>
            <Avatar shape={avatarShape} className="size-11">
              <AvatarImage src={metadata?.picture} alt={displayName} />
              <AvatarFallback className="bg-primary/20 text-primary text-sm">
                {displayName[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </Link>

          <div className="flex-1 min-w-0">
            <Link to={`/${npub}`} className="font-bold text-[15px] hover:underline block truncate">
              {displayName}
            </Link>
            {metadata?.nip05 && (
              <VerifiedNip05Text nip05={metadata.nip05} pubkey={event.pubkey} className="text-sm text-muted-foreground truncate block" />
            )}
          </div>
        </div>

        {/* Badge name */}
        <h2 className="text-xl font-bold mt-4 leading-snug">{badge.name}</h2>

        {/* Description */}
        {badge.description && (
          <p className="text-[15px] text-muted-foreground leading-relaxed mt-2 whitespace-pre-wrap">
            {badge.description}
          </p>
        )}

        {/* Stats + Award to row */}
        <div className="flex items-center justify-between gap-3 mt-4">
          {awardsQuery.isLoading ? (
            <Skeleton className="h-4 w-24" />
          ) : awardedPubkeys.length > 0 ? (
            <span className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Users className="size-4" />
              Awarded to {awardedPubkeys.length} user{awardedPubkeys.length !== 1 ? 's' : ''}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Users className="size-4" />
              No awards yet
            </span>
          )}
          {isIssuer && (
            <Button
              variant="default"
              className="rounded-full px-5 h-9 text-sm font-medium gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 border border-transparent"
              onClick={() => setAwardDialogOpen(true)}
            >
              <Gift className="size-3.5" />
              Award to…
            </Button>
          )}
        </div>

        {/* Accept Badge action */}
        {pendingForUser && (
          <div className="mt-3">
            <Button
              variant="default"
              size="sm"
              disabled={acceptBadge.isPending}
              onClick={() => {
                acceptBadge.mutate(
                  { aTag: badgeATag, awardEventId: pendingForUser.awardEvent.id },
                  { onSuccess: () => toast({ title: 'Badge accepted!' }) },
                );
              }}
            >
              <Check className="size-4 mr-1.5" />
              Accept Badge
            </Button>
          </div>
        )}
      </div>

      {/* Action bar — matches PostDetailPage style */}
      <PostActionBar
        event={event}
        replyLabel="Comments"
        onReply={() => setActiveTab('comments')}
        onMore={() => setMoreMenuOpen(true)}
        className="px-4"
      />

      {/* Tabs */}
      <SubHeaderBar pinned>
        <TabButton label="Awarded To" active={activeTab === 'awarded'} onClick={() => setActiveTab('awarded')} />
        <TabButton label="Feed" active={activeTab === 'feed'} onClick={() => setActiveTab('feed')} />
        <TabButton label="Comments" active={activeTab === 'comments'} onClick={() => setActiveTab('comments')} />
      </SubHeaderBar>

      {/* Tab content */}
      <div style={{ height: ARC_OVERHANG_PX }} />
      {activeTab === 'awarded' ? (
        <AwardedToTab
          awardedPubkeys={awardedPubkeys}
          previewPubkeys={previewPubkeys}
          membersMap={membersMap}
          membersLoading={membersLoading}
          awardsLoading={awardsQuery.isLoading}
        />
      ) : activeTab === 'feed' ? (
        <HoldersFeedTab
          awardedPubkeys={awardedPubkeys}
          awardsLoading={awardsQuery.isLoading}
        />
      ) : (
        <CommentsTab
          event={event}
          orderedReplies={orderedReplies}
          commentsLoading={commentsLoading}
        />
      )}

      <AwardBadgeDialog
        open={awardDialogOpen}
        onOpenChange={setAwardDialogOpen}
        badgeATag={badgeATag}
        badgeName={badge.name}
      />
      <NoteMoreMenu event={event} open={moreMenuOpen} onOpenChange={setMoreMenuOpen} />
    </div>
  );
}

// ─── Awarded To Tab ────────────────────────────────────────────────────────────

function AwardedToTab({ awardedPubkeys, previewPubkeys, membersMap, membersLoading, awardsLoading }: {
  awardedPubkeys: string[];
  previewPubkeys: string[];
  membersMap: Map<string, { metadata?: NostrMetadata }> | undefined;
  membersLoading: boolean;
  awardsLoading: boolean;
}) {
  if (awardsLoading || membersLoading) {
    return (
      <div className="divide-y divide-border">
        {Array.from({ length: 3 }).map((_, i) => (
          <AwardeeCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (awardedPubkeys.length === 0) {
    return (
      <div className="py-16 flex flex-col items-center gap-3 text-center px-8">
        <Users className="size-8 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No one has been awarded this badge yet.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {previewPubkeys.map((pk) => {
        const member = membersMap?.get(pk);
        return <AwardeeCard key={pk} pubkey={pk} metadata={member?.metadata} />;
      })}
      {awardedPubkeys.length > previewPubkeys.length && (
        <div className="px-4 py-3 text-sm text-muted-foreground text-center">
          +{awardedPubkeys.length - previewPubkeys.length} more
        </div>
      )}
    </div>
  );
}

// ─── Holders Feed Tab ──────────────────────────────────────────────────────────

const FEED_PAGE_SIZE = 20;

function HoldersFeedTab({ awardedPubkeys, awardsLoading }: {
  awardedPubkeys: string[];
  awardsLoading: boolean;
}) {
  const { nostr } = useNostr();

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['badge-holders-feed', awardedPubkeys.join(',')],
    queryFn: async ({ pageParam, signal }) => {
      if (awardedPubkeys.length === 0) return [];
      const filter: Record<string, unknown> = {
        kinds: [1],
        authors: awardedPubkeys,
        limit: FEED_PAGE_SIZE,
      };
      if (pageParam) filter.until = pageParam;
      return nostr.query(
        [filter as { kinds: number[]; authors: string[]; limit: number; until?: number }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.length === 0) return undefined;
      return lastPage[lastPage.length - 1].created_at - 1;
    },
    initialPageParam: undefined as number | undefined,
    enabled: awardedPubkeys.length > 0 && !awardsLoading,
    staleTime: 60_000,
  });

  const { ref: scrollRef, inView } = useInView({ threshold: 0, rootMargin: '400px' });

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const feedEvents = useMemo(() => {
    if (!data?.pages) return [];
    const seen = new Set<string>();
    return (data.pages as NostrEvent[][]).flat().filter((event) => {
      if (seen.has(event.id)) return false;
      seen.add(event.id);
      return true;
    });
  }, [data?.pages]);

  if (awardsLoading || isLoading) {
    return (
      <div className="divide-y divide-border">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="px-4 py-4">
            <div className="flex gap-3">
              <Skeleton className="size-10 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (awardedPubkeys.length === 0) {
    return (
      <div className="py-16 flex flex-col items-center gap-3 text-center px-8">
        <Newspaper className="size-8 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No one has been awarded this badge yet, so there's no feed to show.</p>
      </div>
    );
  }

  if (feedEvents.length === 0) {
    return (
      <div className="py-16 flex flex-col items-center gap-3 text-center px-8">
        <Newspaper className="size-8 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No posts from badge holders yet.</p>
      </div>
    );
  }

  return (
    <div>
      {feedEvents.map((event) => (
        <NoteCard key={event.id} event={event} />
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
  );
}

// ─── Comments Tab ──────────────────────────────────────────────────────────────

function CommentsTab({ event, orderedReplies, commentsLoading }: {
  event: NostrEvent;
  orderedReplies: Array<{ reply: NostrEvent; firstSubReply?: NostrEvent }>;
  commentsLoading: boolean;
}) {
  return (
    <div>
      <ComposeBox compact replyTo={event} />
      {commentsLoading ? (
        <CommentsSkeleton />
      ) : orderedReplies.length > 0 ? (
        <ThreadedReplyList replies={orderedReplies} />
      ) : (
        <div className="py-16 flex flex-col items-center gap-3 text-center px-8">
          <MessageCircle className="size-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No comments yet. Be the first to comment on this badge.</p>
        </div>
      )}
    </div>
  );
}

// ─── Shared components ─────────────────────────────────────────────────────────

function AwardeeCard({ pubkey, metadata }: { pubkey: string; metadata?: NostrMetadata }) {
  const displayName = metadata?.name || metadata?.display_name || genUserName(pubkey);
  const about = metadata?.about;
  const avatarShape = getAvatarShape(metadata);
  const profileUrl = useProfileUrl(pubkey, metadata);

  return (
    <Link
      to={profileUrl}
      className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors"
    >
      <Avatar shape={avatarShape} className="size-11 shrink-0">
        <AvatarImage src={metadata?.picture} alt={displayName} />
        <AvatarFallback className="bg-primary/20 text-primary text-sm">
          {displayName[0]?.toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <span className="font-bold text-[15px] hover:underline block truncate">
          {displayName}
        </span>
        {about && (
          <p className="text-sm text-muted-foreground line-clamp-1">{about}</p>
        )}
      </div>
    </Link>
  );
}

function AwardeeCardSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Skeleton className="size-11 rounded-full shrink-0" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-48" />
      </div>
    </div>
  );
}

/**
 * Badge hero with interactive 3D tilt. Hovering moves the badge in
 * perspective space while a specular glare overlay tracks the pointer,
 * making the badge feel like a tangible, glossy object.
 */
/** Extra padding (px) around the badge that expands the pointer hit-area. */
const INTERACT_PAD = 80;

function BadgeHero({ heroImage, badgeName }: { heroImage: string; badgeName: string }) {
  const tilt = useCardTilt(30, 1.06);
  const glareRef = useRef<HTMLDivElement>(null);
  const glareFadeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Mask string that clips overlays to the badge image's visible pixels.
  // This ensures glare and edge effects don't paint over transparent areas.
  const imageMask: React.CSSProperties = {
    maskImage: `url(${heroImage})`,
    WebkitMaskImage: `url(${heroImage})`,
    maskSize: 'cover',
    WebkitMaskSize: 'cover',
    maskRepeat: 'no-repeat',
    WebkitMaskRepeat: 'no-repeat',
    maskPosition: 'center',
    WebkitMaskPosition: 'center',
  };

  /** Update the specular glare position to follow the pointer. */
  const updateGlare = useCallback((clientX: number, clientY: number) => {
    const el = tilt.ref.current;
    const glare = glareRef.current;
    if (!el || !glare) return;
    const rect = el.getBoundingClientRect();
    const x = ((clientX - rect.left - INTERACT_PAD) / (rect.width - INTERACT_PAD * 2)) * 100;
    const y = ((clientY - rect.top - INTERACT_PAD) / (rect.height - INTERACT_PAD * 2)) * 100;
    glare.style.background = `radial-gradient(circle at ${x}% ${y}%, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.08) 35%, transparent 65%)`;
    glare.style.opacity = '1';
  }, [tilt.ref]);

  const fadeGlare = useCallback(() => {
    const glare = glareRef.current;
    if (glare) glare.style.opacity = '0';
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      tilt.onPointerDown(e);
      if (e.pointerType === 'touch') {
        clearTimeout(glareFadeTimerRef.current);
        updateGlare(e.clientX, e.clientY);
      }
    },
    [tilt, updateGlare],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      tilt.onPointerMove(e);
      updateGlare(e.clientX, e.clientY);
    },
    [tilt, updateGlare],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      tilt.onPointerUp(e);
      if (e.pointerType === 'touch') {
        // Fade glare after the same linger delay as the tilt reset
        clearTimeout(glareFadeTimerRef.current);
        glareFadeTimerRef.current = setTimeout(fadeGlare, 600);
      }
    },
    [tilt, fadeGlare],
  );

  const handlePointerLeave = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      tilt.onPointerLeave(e);
      if (e.pointerType === 'touch') {
        clearTimeout(glareFadeTimerRef.current);
        glareFadeTimerRef.current = setTimeout(fadeGlare, 600);
      } else {
        fadeGlare();
      }
    },
    [tilt, fadeGlare],
  );

  return (
    <div className="relative isolate flex justify-center py-10 overflow-hidden">
      {/* Rotating light rays (behind tilt container) */}
      <div
        className="absolute -z-10 pointer-events-none"
        aria-hidden="true"
        style={{
          width: 420,
          height: 420,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        }}
      >
        <div
          className="w-full h-full animate-badge-spotlight"
          style={{
            background: `repeating-conic-gradient(
              hsl(var(--primary) / 0.08) 0deg 6deg,
              transparent 6deg 18deg
            )`,
            maskImage: 'radial-gradient(circle, black 15%, transparent 70%)',
            WebkitMaskImage: 'radial-gradient(circle, black 15%, transparent 70%)',
          }}
        />
      </div>

      {/*
        3D-tiltable badge. The large padding expands the pointer hit-area
        well beyond the image so the mouse begins influencing tilt from a
        distance. Negative margin compensates so layout stays unchanged.
      */}
      <div
        ref={tilt.ref}
        style={{ ...tilt.style, transformStyle: 'preserve-3d', padding: INTERACT_PAD, margin: -INTERACT_PAD }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        className="relative select-none"
      >
        <img
          src={heroImage}
          alt={badgeName}
          className="size-36 object-cover drop-shadow-lg"
          loading="lazy"
          draggable={false}
        />
        {/* Specular glare overlay — masked to the image's alpha channel */}
        <div
          ref={glareRef}
          className="absolute pointer-events-none"
          style={{
            inset: INTERACT_PAD,
            opacity: 0,
            transition: 'opacity 0.4s ease-out',
            mixBlendMode: 'overlay',
            ...imageMask,
          }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

function CommentsSkeleton() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="px-4 py-3">
          <div className="flex gap-3">
            <Skeleton className="size-10 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
