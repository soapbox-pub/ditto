/**
 * PeopleListDetailContent
 *
 * Unified full-page detail view for all "people list" event kinds:
 *   - Kind 3     (NIP-02 follow list)
 *   - Kind 30000 (NIP-51 follow set)
 *   - Kind 39089 (follow pack / starter pack)
 *
 * Renders a hero image, author row, title + description, action row (Follow All,
 * Save, Share, Add-to-sidebar, etc.), and tabs for Feed and Members.
 *
 * Owner-mode features (remove members, add members) are enabled automatically
 * when the current user owns a kind 30000 list.
 */
import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useInView } from 'react-intersection-observer';
import {
  Users,
  UserPlus,
  Check,
  Loader2,
  Copy,
  X,
  MessageCircle,
} from 'lucide-react';
import { nip19 } from 'nostr-tools';
import type { NostrEvent, NostrFilter, NostrMetadata } from '@nostrify/nostrify';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { NoteCard } from '@/components/NoteCard';
import { TabButton } from '@/components/TabButton';
import { SubHeaderBar } from '@/components/SubHeaderBar';
import { VerifiedNip05Text } from '@/components/Nip05Badge';
import { AddMembersDialog } from '@/components/AddMembersDialog';
import { ComposeBox } from '@/components/ComposeBox';
import { FlatThreadedReplyList } from '@/components/ThreadedReplyList';
import { ARC_OVERHANG_PX } from '@/components/ArcBackground';
import { PostActionBar } from '@/components/PostActionBar';
import { NoteMoreMenu } from '@/components/NoteMoreMenu';

import { useToast } from '@/hooks/useToast';
import { useAuthor } from '@/hooks/useAuthor';
import { useAuthors } from '@/hooks/useAuthors';
import { useComments } from '@/hooks/useComments';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFollowList, useFollowActions } from '@/hooks/useFollowActions';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useTabFeed } from '@/hooks/useProfileFeed';
import { useMuteList } from '@/hooks/useMuteList';
import { useUserLists } from '@/hooks/useUserLists';
import { useNostr } from '@nostrify/react';

import { isEventMuted } from '@/lib/muteHelpers';
import { shouldHideFeedEvent } from '@/lib/feedUtils';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
import { genUserName } from '@/lib/genUserName';
import { isReplyEvent } from '@/lib/nostrEvents';
import { getDisplayPubkeys, parsePeopleList } from '@/lib/packUtils';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

type Tab = 'feed' | 'members' | 'comments';

// ─── Feed Tab ─────────────────────────────────────────────────────────────────

/**
 * Paginated feed of posts from a list of member pubkeys.
 *
 * Uses `useTabFeed` (TanStack Query-backed infinite scroll) plus an
 * IntersectionObserver sentinel for infinite scroll. Filters kind 1 posts
 * (excluding replies) and kinds 6/16 reposts from the given authors.
 *
 * @param tabKey - A stable cache namespace, typically the list's naddr.
 */
export function PeopleListFeedTab({ pubkeys, tabKey }: { pubkeys: string[]; tabKey: string }) {
  const { muteItems } = useMuteList();
  const { ref: sentinelRef, inView } = useInView({ threshold: 0, rootMargin: '400px' });

  // Build the TabFeed filter. Scope to kind 1 posts + kind 6/16 reposts so the
  // feed behaves like a normal timeline of people's posts (not their follow
  // sets, emoji packs, etc.). Replies are filtered out below in the render
  // step since the relay doesn't expose a "no-replies" filter.
  const filter = useMemo<NostrFilter | null>(
    () => (pubkeys.length > 0 ? { kinds: [1, 6, 16], authors: pubkeys } : null),
    [pubkeys],
  );

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useTabFeed(filter, `people-list-${tabKey}`, pubkeys.length > 0);

  // Fetch next page when the sentinel scrolls into view.
  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Flatten pages, dedupe, and apply mute / content-warning / reply filters.
  const feedItems = useMemo(() => {
    if (!data?.pages) return [];
    const seen = new Set<string>();
    return data.pages
      .flatMap((page) => page.items)
      .filter((item) => {
        const key = item.repostedBy ? `repost-${item.repostedBy}-${item.event.id}` : item.event.id;
        if (seen.has(key)) return false;
        seen.add(key);
        if (shouldHideFeedEvent(item.event)) return false;
        if (muteItems.length > 0 && isEventMuted(item.event, muteItems)) return false;
        // Hide replies — this tab should show top-level posts only (reposts of
        // replies are fine, so only check original kind 1 events, not reposts).
        if (item.event.kind === 1 && !item.repostedBy && isReplyEvent(item.event)) {
          return false;
        }
        return true;
      });
  }, [data?.pages, muteItems]);

  if (pubkeys.length === 0) {
    return (
      <div className="py-16 text-center text-muted-foreground">
        <Users className="size-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No members in this list yet.</p>
      </div>
    );
  }

  if (isLoading && feedItems.length === 0) {
    return (
      <div className="divide-y divide-border">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="px-4 py-3">
            <div className="flex gap-3">
              <Skeleton className="size-11 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (feedItems.length === 0) {
    return (
      <div className="py-16 text-center text-muted-foreground text-sm">
        No posts from list members yet.
      </div>
    );
  }

  return (
    <div>
      {feedItems.map((item) => (
        <NoteCard
          key={item.repostedBy ? `repost-${item.repostedBy}-${item.event.id}` : item.event.id}
          event={item.event}
          repostedBy={item.repostedBy}
        />
      ))}
      {hasNextPage && (
        <div ref={sentinelRef} className="flex justify-center py-6">
          {isFetchingNextPage && <Loader2 className="size-5 animate-spin text-muted-foreground" />}
        </div>
      )}
    </div>
  );
}

// ─── Members Tab ──────────────────────────────────────────────────────────────

interface MembersTabProps {
  pubkeys: string[];
  membersMap: Map<string, { metadata?: NostrMetadata }> | undefined;
  membersLoading: boolean;
  followedPubkeys: Set<string>;
  currentUserPubkey: string | undefined;
  /** When true, show per-member "Remove" buttons. Enabled for owners of kind 30000 lists. */
  canRemove: boolean;
  /** Kind 30000 d-tag — required when canRemove is true. */
  listId?: string;
}

export function PeopleListMembersTab({
  pubkeys,
  membersMap,
  membersLoading,
  followedPubkeys,
  currentUserPubkey,
  canRemove,
  listId,
}: MembersTabProps) {
  if (membersLoading) {
    return (
      <div className="divide-y divide-border">
        {Array.from({ length: Math.min(pubkeys.length, 8) }).map((_, i) => (
          <MemberCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {pubkeys.map((pk) => {
        const member = membersMap?.get(pk);
        const isFollowed = followedPubkeys.has(pk);
        return (
          <MemberCard
            key={pk}
            pubkey={pk}
            metadata={member?.metadata}
            isFollowed={isFollowed}
            isSelf={pk === currentUserPubkey}
            canRemove={canRemove}
            listId={listId}
          />
        );
      })}
    </div>
  );
}

// ─── Comments Tab ─────────────────────────────────────────────────────────────

function PeopleListCommentsTab({
  event,
  orderedReplies,
  commentsLoading,
}: {
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
        <FlatThreadedReplyList replies={orderedReplies} />
      ) : (
        <div className="py-16 flex flex-col items-center gap-3 text-center px-8">
          <MessageCircle className="size-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            No comments yet. Be the first to comment.
          </p>
        </div>
      )}
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

// ─── Main Detail Component ────────────────────────────────────────────────────

export function PeopleListDetailContent({ event }: { event: NostrEvent }) {
  const { toast } = useToast();
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { data: followList } = useFollowList();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { lists: ownLists, createList } = useUserLists();

  const isOwnList = user && event.pubkey === user.pubkey;
  const isFollowList = event.kind === 3;
  const isFollowSet = event.kind === 30000;
  const dTag = useMemo(
    () => event.tags.find(([n]) => n === 'd')?.[1] ?? '',
    [event.tags],
  );

  // Author
  const author = useAuthor(event.pubkey);
  const authorMetadata = author.data?.metadata;
  const authorAvatarShape = getAvatarShape(authorMetadata);
  const authorName = authorMetadata?.name || authorMetadata?.display_name || genUserName(event.pubkey);
  const authorNpub = useMemo(() => nip19.npubEncode(event.pubkey), [event.pubkey]);

  // Parsed list (for kind 3 uses author metadata as fallback)
  const { title, description, image, pubkeys } = useMemo(
    () => parsePeopleList(event, {
      authorMetadata,
      authorDisplayName: authorName,
    }),
    [event, authorMetadata, authorName],
  );
  // Reversed for kind 3 follow lists so newest follows show first; identity
  // for curated kinds. Used only for display — mutations and filters continue
  // to use the original `pubkeys` array.
  const displayPubkeys = useMemo(() => getDisplayPubkeys(event, pubkeys), [event, pubkeys]);
  const safeImage = useMemo(() => sanitizeUrl(image), [image]);

  // Batch-fetch all member profiles
  const { data: membersMap, isLoading: membersLoading } = useAuthors(pubkeys);

  // Comments (NIP-22 kind 1111, indexed by #A for replaceable / addressable roots)
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

  // Follow state
  const followedPubkeys = useMemo(
    () => new Set(followList?.pubkeys ?? []),
    [followList],
  );
  const newPubkeys = useMemo(
    () => pubkeys.filter((pk) => !followedPubkeys.has(pk)),
    [pubkeys, followedPubkeys],
  );

  const [activeTab, setActiveTab] = useState<Tab>('feed');
  const [isFollowingAll, setIsFollowingAll] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  // Owner-mode remove is only available for lists we manage locally (kind 30000)
  const ownerCanRemove = !!(isOwnList && isFollowSet && ownLists.some((l) => l.id === dTag));

  // Stable cache-key for the feed tab — the naddr uniquely identifies this list.
  const shareNip19 = useMemo(() => {
    if (isFollowList) {
      // Kind 3 is replaceable, no d-tag
      return nip19.naddrEncode({ kind: 3, pubkey: event.pubkey, identifier: '' });
    }
    return nip19.naddrEncode({
      kind: event.kind,
      pubkey: event.pubkey,
      identifier: dTag,
    });
  }, [event, dTag, isFollowList]);

  // ── Follow All ───────────────────────────────────────────────────────────
  const handleFollowAll = useCallback(async () => {
    if (!user) {
      toast({
        title: 'Not logged in',
        description: 'Please log in to follow users.',
        variant: 'destructive',
      });
      return;
    }

    setIsFollowingAll(true);
    try {
      // 1. Fetch freshest kind 3 from relays (not cache)
      const prev = await fetchFreshEvent(nostr, { kinds: [3], authors: [user.pubkey] });

      // 2. Separate p-tags from non-p-tags to preserve relay hints, petnames, etc.
      const existingPTags = prev?.tags.filter(([n]) => n === 'p') ?? [];
      const nonPTags = prev?.tags.filter(([n]) => n !== 'p') ?? [];
      const existingPubkeys = new Set(existingPTags.map(([, pk]) => pk));

      // 3. Merge: add new pubkeys that aren't already followed.
      //    For kind 3 follow lists (the viewed event IS a kind 3), always also add the author.
      const candidates = isFollowList ? [...pubkeys, event.pubkey] : pubkeys;
      const newPTags = candidates
        .filter((pk) => pk !== user.pubkey && !existingPubkeys.has(pk))
        .map((pk) => ['p', pk]);
      const added = newPTags.length;

      // 4. Publish with prev for published_at preservation
      await publishEvent({
        kind: 3,
        content: prev?.content ?? '',
        tags: [...nonPTags, ...existingPTags, ...newPTags],
        prev: prev ?? undefined,
      });

      toast({
        title: 'Following all!',
        description: added > 0
          ? `Added ${added} new account${added !== 1 ? 's' : ''} to your follow list.`
          : 'You were already following everyone in this list.',
      });
    } catch (error) {
      console.error('Failed to follow all:', error);
      toast({
        title: 'Failed to follow',
        description: 'There was an error updating your follow list.',
        variant: 'destructive',
      });
    } finally {
      setIsFollowingAll(false);
    }
  }, [user, pubkeys, nostr, publishEvent, toast, isFollowList, event.pubkey]);

  // ── Clone (save a copy of this list as my own kind 30000) ─────────────────
  const handleClone = useCallback(async () => {
    if (!user || cloning) return;
    setCloning(true);
    try {
      await createList.mutateAsync({
        title,
        description: description || undefined,
        pubkeys,
      });
      toast({ title: `Saved "${title}" to your lists` });
    } catch {
      toast({ title: 'Failed to save list', variant: 'destructive' });
    } finally {
      setCloning(false);
    }
  }, [user, cloning, createList, title, description, pubkeys, toast]);

  // When the user is viewing their own kind 3, Follow All makes no sense.
  const showFollowAllButton = !(isOwnList && isFollowList);

  return (
    <>
      {/* Hero image */}
      {safeImage && (
        <div className="w-full overflow-hidden bg-muted border-b border-border">
          <img
            src={safeImage}
            alt={title}
            className="w-full h-auto max-h-[300px] object-cover"
            loading="lazy"
            onError={(e) => {
              (e.currentTarget.parentElement as HTMLElement).style.display = 'none';
            }}
          />
        </div>
      )}

      <div className="px-4 pt-4 pb-3">
        {/* Author row */}
        <div className="flex items-center gap-3">
          <Link to={`/${authorNpub}`}>
            <Avatar shape={authorAvatarShape} className="size-11">
              <AvatarImage src={authorMetadata?.picture} alt={authorName} />
              <AvatarFallback className="bg-primary/20 text-primary text-sm">
                {authorName[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </Link>

          <div className="flex-1 min-w-0">
            <Link
              to={`/${authorNpub}`}
              className="font-bold text-[15px] hover:underline block truncate"
            >
              {authorName}
            </Link>
            {authorMetadata?.nip05 && (
              <VerifiedNip05Text
                nip05={authorMetadata.nip05}
                pubkey={event.pubkey}
                className="text-sm text-muted-foreground truncate block"
              />
            )}
          </div>
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold mt-4 leading-snug">{title}</h2>

        {/* Description */}
        {description && (
          <p className="text-[15px] text-muted-foreground leading-relaxed mt-2 whitespace-pre-wrap">
            {description}
          </p>
        )}

        {/* "N new for you" hint */}
        {newPubkeys.length > 0 && user && !isOwnList && (
          <div className="mt-4 text-sm text-green-600 dark:text-green-400">
            {newPubkeys.length} new for you
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-3">
          {showFollowAllButton && (
            <Button
              className="gap-2 flex-1"
              onClick={handleFollowAll}
              disabled={isFollowingAll || !user}
            >
              {isFollowingAll ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Following…
                </>
              ) : newPubkeys.length === 0 && user ? (
                <>
                  <Check className="size-4" />
                  Already following all
                </>
              ) : (
                <>
                  <UserPlus className="size-4" />
                  Follow All ({pubkeys.length})
                </>
              )}
            </Button>
          )}

          {/* Save (clone) — available to logged-in viewers who don't own the list, not for kind 3 (that's your follow list, you don't clone it) */}
          {user && !isOwnList && !isFollowList && (
            <Button
              variant="outline"
              className={showFollowAllButton ? undefined : 'flex-1'}
              onClick={handleClone}
              disabled={cloning}
              title="Save a copy to your lists"
            >
              {cloning ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Copy className="size-4" />
              )}
              Save
            </Button>
          )}
        </div>
      </div>

      {/* Interaction bar — reply / repost / react / zap / share / more */}
      <PostActionBar
        event={event}
        replyLabel="Comments"
        onReply={() => setActiveTab('comments')}
        onMore={() => setMoreMenuOpen(true)}
        className="px-4"
      />

      {/* Tab bar */}
      <SubHeaderBar pinned>
        <TabButton label="Feed" active={activeTab === 'feed'} onClick={() => setActiveTab('feed')} />
        <TabButton
          label="Members"
          active={activeTab === 'members'}
          onClick={() => setActiveTab('members')}
        >
          <span className="flex items-center justify-center gap-1.5">
            Members
            <span className="text-xs text-muted-foreground">({pubkeys.length})</span>
          </span>
        </TabButton>
        <TabButton
          label="Comments"
          active={activeTab === 'comments'}
          onClick={() => setActiveTab('comments')}
        />
      </SubHeaderBar>

      {/* Spacer below the pinned tabs (matches ProfilePage / BadgeDetailContent). */}
      <div style={{ height: ARC_OVERHANG_PX }} />

      {/* Owner "Add members" row — above members tab content */}
      {ownerCanRemove && activeTab === 'members' && (
        <div className="px-4 py-3 border-b border-border">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setAddMembersOpen(true)}
          >
            <UserPlus className="size-4" />
            Add Members
          </Button>
        </div>
      )}

      {/* Tab content */}
      {activeTab === 'feed' ? (
        <PeopleListFeedTab pubkeys={pubkeys} tabKey={shareNip19} />
      ) : activeTab === 'members' ? (
        <PeopleListMembersTab
          pubkeys={displayPubkeys}
          membersMap={membersMap}
          membersLoading={membersLoading}
          followedPubkeys={followedPubkeys}
          currentUserPubkey={user?.pubkey}
          canRemove={ownerCanRemove}
          listId={dTag}
        />
      ) : (
        <PeopleListCommentsTab
          event={event}
          orderedReplies={orderedReplies}
          commentsLoading={commentsLoading}
        />
      )}

      {ownerCanRemove && (
        <AddMembersDialog
          open={addMembersOpen}
          onOpenChange={setAddMembersOpen}
          listId={dTag}
          listPubkeys={pubkeys}
        />
      )}

      <NoteMoreMenu
        event={event}
        open={moreMenuOpen}
        onOpenChange={setMoreMenuOpen}
      />
    </>
  );
}

// ─── Member Card ──────────────────────────────────────────────────────────────

interface MemberCardProps {
  pubkey: string;
  metadata?: NostrMetadata;
  isFollowed: boolean;
  isSelf: boolean;
  /** When true, renders a "remove" button that calls useUserLists().removeFromList. */
  canRemove?: boolean;
  /** Kind 30000 d-tag — required when canRemove is true. */
  listId?: string;
}

export function MemberCard({
  pubkey,
  metadata,
  isFollowed,
  isSelf,
  canRemove,
  listId,
}: MemberCardProps) {
  const navigate = useNavigate();
  const npub = useMemo(() => nip19.npubEncode(pubkey), [pubkey]);
  const displayName = metadata?.name || metadata?.display_name || genUserName(pubkey);
  const about = metadata?.about;
  const avatarShape = getAvatarShape(metadata);
  const { follow, unfollow, isPending } = useFollowActions();
  const { removeFromList } = useUserLists();
  const { toast } = useToast();
  const [removing, setRemoving] = useState(false);

  const handleFollowToggle = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isFollowed) {
        await unfollow(pubkey);
      } else {
        await follow(pubkey);
      }
    },
    [isFollowed, pubkey, follow, unfollow],
  );

  const handleRemove = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!listId) return;
      setRemoving(true);
      try {
        await removeFromList.mutateAsync({ listId, pubkey });
        toast({ title: 'Removed from list' });
      } catch {
        toast({ title: 'Failed to remove', variant: 'destructive' });
      } finally {
        setRemoving(false);
      }
    },
    [listId, pubkey, removeFromList, toast],
  );

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors cursor-pointer group"
      onClick={() => navigate(`/${npub}`)}
    >
      <Link to={`/${npub}`} className="shrink-0" onClick={(e) => e.stopPropagation()}>
        <Avatar shape={avatarShape} className="size-11">
          <AvatarImage src={metadata?.picture} alt={displayName} />
          <AvatarFallback className="bg-primary/20 text-primary text-sm">
            {displayName[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </Link>

      <div className="flex-1 min-w-0">
        <Link
          to={`/${npub}`}
          className="font-bold text-[15px] hover:underline block truncate"
          onClick={(e) => e.stopPropagation()}
        >
          {displayName}
        </Link>
        {about && (
          <p className="text-sm text-muted-foreground line-clamp-1">
            {about}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {!isSelf && (
          <Button
            variant={isFollowed ? 'outline' : 'default'}
            size="sm"
            className="shrink-0"
            onClick={handleFollowToggle}
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : isFollowed ? (
              'Following'
            ) : (
              'Follow'
            )}
          </Button>
        )}

        {canRemove && listId && (
          <button
            onClick={handleRemove}
            disabled={removing}
            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-40 transition-all"
            aria-label="Remove from list"
          >
            {removing
              ? <Loader2 className="size-4 animate-spin" />
              : <X className="size-4" />}
          </button>
        )}
      </div>
    </div>
  );
}

export function MemberCardSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Skeleton className="size-11 rounded-full shrink-0" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-48" />
      </div>
      <Skeleton className="h-8 w-20 rounded-md" />
    </div>
  );
}
