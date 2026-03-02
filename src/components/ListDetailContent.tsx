import { useMemo, useState, useCallback, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Users, UserPlus, Check, Loader2, Copy, List, Trash2, Pin, PinOff, X, CopyPlus } from 'lucide-react';
import { useInView } from 'react-intersection-observer';
import { nip19 } from 'nostr-tools';
import { useNostr } from '@nostrify/react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { NoteCard } from '@/components/NoteCard';
import { useToast } from '@/hooks/useToast';
import { useAuthor } from '@/hooks/useAuthor';
import { useAuthors } from '@/hooks/useAuthors';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFollowList, useFollowActions } from '@/hooks/useFollowActions';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { usePersonalLists } from '@/hooks/usePersonalLists';
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { getEnabledFeedKinds } from '@/lib/extraKinds';
import { getPaginationCursor, isRepostKind, parseRepostContent } from '@/lib/feedUtils';
import type { FeedItem } from '@/lib/feedUtils';
import { genUserName } from '@/lib/genUserName';
import { VerifiedNip05Text } from '@/components/Nip05Badge';
import { cn } from '@/lib/utils';
import { useAppContext } from '@/hooks/useAppContext';
import { AddMembersDialog } from '@/components/AddMembersDialog';

const PAGE_SIZE = 15;

type DetailTab = 'feed' | 'members';

function parseListEvent(event: NostrEvent) {
  const getTag = (name: string) => event.tags.find(([n]) => n === name)?.[1];
  const dTag = getTag('d') ?? '';
  const title = getTag('title') || getTag('name') || 'Untitled List';
  const description = getTag('description') || getTag('summary') || '';
  const image = getTag('image') || getTag('thumb') || getTag('banner');
  const pubkeys = event.tags.filter(([n]) => n === 'p').map(([, pk]) => pk);

  return { dTag, title, description, image, pubkeys };
}

export function ListDetailContent({ event }: { event: NostrEvent }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const { data: followList } = useFollowList();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { deleteList, removeFromList, pinList, unpinList } = usePersonalLists();
  const { feedSettings } = useFeedSettings();

  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name || genUserName(event.pubkey);
  const npub = useMemo(() => nip19.npubEncode(event.pubkey), [event.pubkey]);

  const { dTag, title, description, image, pubkeys } = useMemo(() => parseListEvent(event), [event]);

  const isOwner = user?.pubkey === event.pubkey;
  const isPinned = (config.pinnedLists ?? []).includes(dTag);

  const [activeTab, setActiveTab] = useState<DetailTab>('feed');
  const [copied, setCopied] = useState(false);
  const [isFollowingAll, setIsFollowingAll] = useState(false);
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [addMembersOpen, setAddMembersOpen] = useState(false);

  // Follow state
  const followedPubkeys = useMemo(() => new Set(followList?.pubkeys ?? []), [followList]);
  const newPubkeys = useMemo(
    () => pubkeys.filter((pk) => !followedPubkeys.has(pk)),
    [pubkeys, followedPubkeys],
  );

  // Batch-fetch all member profiles
  const { data: membersMap, isLoading: membersLoading } = useAuthors(pubkeys);

  const handleFollowAll = useCallback(async () => {
    if (!user) {
      toast({ title: 'Not logged in', description: 'Please log in to follow users.', variant: 'destructive' });
      return;
    }

    setIsFollowingAll(true);
    try {
      const signal = AbortSignal.timeout(10_000);
      const followEvents = await nostr.query(
        [{ kinds: [3], authors: [user.pubkey], limit: 1 }],
        { signal },
      );

      const latestEvent = followEvents.length > 0
        ? followEvents.reduce((latest, current) => current.created_at > latest.created_at ? current : latest)
        : null;

      const existingFollows = latestEvent
        ? latestEvent.tags.filter(([name]) => name === 'p').map(([, pk]) => pk)
        : [];

      const allFollows = [...new Set([...existingFollows, ...pubkeys])];
      const added = pubkeys.filter((pk) => !existingFollows.includes(pk));

      await publishEvent({
        kind: 3,
        content: latestEvent?.content ?? '',
        tags: allFollows.map((pk) => ['p', pk]),
      });

      toast({
        title: 'Following all!',
        description: added.length > 0
          ? `Added ${added.length} new account${added.length !== 1 ? 's' : ''} to your follow list.`
          : 'You were already following everyone in this list.',
      });
    } catch (error) {
      console.error('Failed to follow all:', error);
      toast({ title: 'Failed to follow', description: 'There was an error updating your follow list.', variant: 'destructive' });
    } finally {
      setIsFollowingAll(false);
    }
  }, [user, pubkeys, nostr, publishEvent, toast]);

  const handleCopyLink = useCallback(() => {
    const naddr = nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier: dTag });
    navigator.clipboard.writeText(`${window.location.origin}/${naddr}`);
    setCopied(true);
    toast({ title: 'Link copied!' });
    setTimeout(() => setCopied(false), 2000);
  }, [event, dTag, toast]);

  const handleDelete = useCallback(async () => {
    try {
      await deleteList.mutateAsync(dTag);
      toast({ title: 'List deleted' });
      navigate('/lists');
    } catch {
      toast({ title: 'Failed to delete list', variant: 'destructive' });
    }
  }, [dTag, deleteList, navigate, toast]);

  const handlePinToggle = useCallback(() => {
    if (isPinned) {
      unpinList(dTag);
      toast({ title: 'Unpinned from feed' });
    } else {
      pinList(dTag);
      toast({ title: 'Pinned to feed' });
    }
  }, [dTag, isPinned, pinList, unpinList, toast]);

  const handleRemoveMember = useCallback(async (pubkey: string) => {
    try {
      await removeFromList.mutateAsync({ dTag, pubkey });
      toast({ title: 'Member removed' });
    } catch {
      toast({ title: 'Failed to remove member', variant: 'destructive' });
    }
  }, [dTag, removeFromList, toast]);

  return (
    <div>
      {/* Hero image */}
      {image && (
        <div className="w-full overflow-hidden bg-muted border-b border-border">
          <img src={image} alt={title} className="w-full h-auto max-h-[300px] object-cover" loading="lazy"
            onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none'; }} />
        </div>
      )}

      <div className="px-4 pt-4 pb-3">
        {/* Author row */}
        <div className="flex items-center gap-3">
          <Link to={`/${npub}`}>
            <Avatar className="size-11">
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

          <Badge variant="secondary" className="shrink-0 gap-1">
            <List className="size-3" />
            List
          </Badge>
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold mt-4 leading-snug">{title}</h2>

        {/* Description */}
        {description && (
          <p className="text-[15px] text-muted-foreground leading-relaxed mt-2 whitespace-pre-wrap">
            {description}
          </p>
        )}

        {/* Stats */}
        <div className="flex items-center gap-3 mt-4">
          <span className="text-sm text-muted-foreground flex items-center gap-1.5">
            <Users className="size-4" />
            {pubkeys.length} member{pubkeys.length !== 1 ? 's' : ''}
          </span>
          {newPubkeys.length > 0 && user && (
            <span className="text-sm text-green-600 dark:text-green-400">
              {newPubkeys.length} new for you
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-3 flex-wrap">
          <Button className="gap-2 flex-1" onClick={handleFollowAll} disabled={isFollowingAll || !user}>
            {isFollowingAll ? (
              <><Loader2 className="size-4 animate-spin" />Following…</>
            ) : newPubkeys.length === 0 && user ? (
              <><Check className="size-4" />Already following all</>
            ) : (
              <><UserPlus className="size-4" />Follow All ({pubkeys.length})</>
            )}
          </Button>

          {isOwner && (
            <Button variant="outline" size="icon" onClick={handlePinToggle} title={isPinned ? 'Unpin from feed' : 'Pin to feed'}>
              {isPinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
            </Button>
          )}

          {!isOwner && user && (
            <Button variant="outline" size="icon" onClick={() => setCloneDialogOpen(true)} title="Clone list">
              <CopyPlus className="size-4" />
            </Button>
          )}

          <Button variant="outline" size="icon" onClick={handleCopyLink}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          </Button>

          {isOwner && (
            <Button variant="outline" size="icon" onClick={handleDelete} className="text-destructive hover:text-destructive">
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <TabButton label="Feed" active={activeTab === 'feed'} onClick={() => setActiveTab('feed')} />
        <TabButton label="Members" active={activeTab === 'members'} onClick={() => setActiveTab('members')} />
      </div>

      {/* Tab content */}
      {activeTab === 'feed' ? (
        <ListFeedTab pubkeys={pubkeys} feedSettings={feedSettings} />
      ) : (
        <div>
          {isOwner && (
            <div className="px-4 py-3 border-b border-border">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setAddMembersOpen(true)}>
                <UserPlus className="size-3.5" />
                Add Members
              </Button>
            </div>
          )}
          <div className="divide-y divide-border">
            {membersLoading ? (
              Array.from({ length: Math.min(pubkeys.length, 8) }).map((_, i) => (
                <MemberCardSkeleton key={i} />
              ))
            ) : (
              pubkeys.map((pk) => {
                const member = membersMap?.get(pk);
                const isFollowed = followedPubkeys.has(pk);
                return (
                  <MemberCard
                    key={pk}
                    pubkey={pk}
                    metadata={member?.metadata}
                    isFollowed={isFollowed}
                    isSelf={pk === user?.pubkey}
                    isOwner={isOwner}
                    onRemove={() => handleRemoveMember(pk)}
                  />
                );
              })
            )}
          </div>
        </div>
      )}

      {isOwner && (
        <AddMembersDialog
          open={addMembersOpen}
          onOpenChange={setAddMembersOpen}
          dTag={dTag}
          currentMembers={pubkeys}
        />
      )}

      {!isOwner && user && (
        <CloneListDialog
          open={cloneDialogOpen}
          onOpenChange={setCloneDialogOpen}
          title={title}
          description={description}
          image={image}
          pubkeys={pubkeys}
        />
      )}
    </div>
  );
}

/** Feed tab: posts from list members with infinite scroll. */
function ListFeedTab({ pubkeys, feedSettings }: { pubkeys: string[]; feedSettings: ReturnType<typeof useFeedSettings>['feedSettings'] }) {
  const { nostr } = useNostr();

  const allKinds = useMemo(() => getEnabledFeedKinds(feedSettings), [feedSettings]);
  const pubkeysKey = useMemo(() => [...pubkeys].sort().join(','), [pubkeys]);

  const feedQuery = useInfiniteQuery({
    queryKey: ['list-feed', pubkeysKey, allKinds.sort().join(',')],
    queryFn: async ({ pageParam }) => {
      const signal = AbortSignal.timeout(8000);
      const now = Math.floor(Date.now() / 1000);

      const filter: Record<string, unknown> = { kinds: allKinds, authors: pubkeys, limit: PAGE_SIZE };
      if (pageParam) filter.until = pageParam;

      const rawEvents = await nostr.query(
        [filter as { kinds: number[]; authors: string[]; limit: number; until?: number }],
        { signal },
      );

      const validEvents = rawEvents.filter((ev) => ev.created_at <= now);
      const oldestQueryTimestamp = getPaginationCursor(validEvents);

      // Unwrap reposts (kind 6/16) into FeedItems
      const items: FeedItem[] = [];
      const repostMissingIds: string[] = [];
      const repostMap = new Map<string, NostrEvent>();

      for (const ev of validEvents) {
        if (isRepostKind(ev.kind)) {
          const embedded = parseRepostContent(ev);
          if (embedded && embedded.created_at <= now) {
            items.push({ event: embedded, repostedBy: ev.pubkey, sortTimestamp: ev.created_at });
          } else {
            const repostedId = ev.tags.find(([name]) => name === 'e')?.[1];
            if (repostedId) {
              repostMissingIds.push(repostedId);
              repostMap.set(repostedId, ev);
            }
          }
        } else {
          items.push({ event: ev, sortTimestamp: ev.created_at });
        }
      }

      // Fetch any reposted originals not embedded in the repost content
      if (repostMissingIds.length > 0) {
        try {
          const originals = await nostr.query(
            [{ ids: repostMissingIds, limit: repostMissingIds.length }],
            { signal },
          );
          for (const original of originals) {
            const repost = repostMap.get(original.id);
            if (repost && original.created_at <= now) {
              items.push({ event: original, repostedBy: repost.pubkey, sortTimestamp: repost.created_at });
            }
          }
        } catch {
          // timeout — skip missing reposts
        }
      }

      // Deduplicate, preferring direct posts over reposts of the same event
      const seen = new Map<string, FeedItem>();
      for (const item of items) {
        const existing = seen.get(item.event.id);
        if (!existing) seen.set(item.event.id, item);
        else if (!item.repostedBy && existing.repostedBy) seen.set(item.event.id, item);
      }

      const dedupedItems = Array.from(seen.values()).sort((a, b) => b.sortTimestamp - a.sortTimestamp);

      return { items: dedupedItems, oldestQueryTimestamp };
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.items.length === 0) return undefined;
      return lastPage.oldestQueryTimestamp - 1;
    },
    initialPageParam: undefined as number | undefined,
    enabled: pubkeys.length > 0,
    staleTime: 30 * 1000,
    placeholderData: (prev) => prev,
  });

  const { data: feedData, hasNextPage, isFetchingNextPage, fetchNextPage, isLoading: feedLoading } = feedQuery;

  const feedItems = useMemo(() => {
    if (!feedData?.pages) return [];
    const seen = new Set<string>();
    return feedData.pages
      .flatMap((page) => page.items)
      .filter((item) => {
        if (seen.has(item.event.id)) return false;
        seen.add(item.event.id);
        return true;
      });
  }, [feedData?.pages]);

  // Auto-fetch page 2
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && feedData?.pages?.length === 1) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, feedData?.pages?.length, fetchNextPage]);

  const { ref: scrollRef, inView } = useInView({ threshold: 0, rootMargin: '400px' });
  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (pubkeys.length === 0) {
    return (
      <div className="py-16 px-8 text-center">
        <p className="text-muted-foreground">This list has no members yet.</p>
      </div>
    );
  }

  if (feedLoading) {
    return (
      <div className="divide-y divide-border">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="px-4 py-3">
            <div className="flex items-center gap-3">
              <Skeleton className="size-11 rounded-full shrink-0" />
              <div className="min-w-0 space-y-1.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-36" />
              </div>
            </div>
            <div className="mt-2 space-y-1.5">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (feedItems.length === 0) {
    return (
      <div className="py-16 px-8 text-center">
        <p className="text-muted-foreground">No posts from list members yet.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {feedItems.map((item) => (
        <NoteCard key={item.event.id} event={item.event} repostedBy={item.repostedBy} />
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

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-1 py-3.5 text-center text-sm font-medium transition-colors relative hover:bg-secondary/40',
        active ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      {label}
      {active && (
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-1 bg-primary rounded-full" />
      )}
    </button>
  );
}

function MemberCard({
  pubkey, metadata, isFollowed, isSelf, isOwner, onRemove,
}: {
  pubkey: string;
  metadata?: NostrMetadata;
  isFollowed: boolean;
  isSelf: boolean;
  isOwner: boolean;
  onRemove: () => void;
}) {
  const navigate = useNavigate();
  const npub = useMemo(() => nip19.npubEncode(pubkey), [pubkey]);
  const displayName = metadata?.name || metadata?.display_name || genUserName(pubkey);
  const about = metadata?.about;
  const { follow, unfollow, isPending } = useFollowActions();

  const handleFollowToggle = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isFollowed) await unfollow(pubkey);
      else await follow(pubkey);
    },
    [isFollowed, pubkey, follow, unfollow],
  );

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors cursor-pointer"
      onClick={() => navigate(`/${npub}`)}
    >
      <Link to={`/${npub}`} className="shrink-0" onClick={(e) => e.stopPropagation()}>
        <Avatar className="size-11">
          <AvatarImage src={metadata?.picture} alt={displayName} />
          <AvatarFallback className="bg-primary/20 text-primary text-sm">
            {displayName[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </Link>

      <div className="flex-1 min-w-0">
        <Link to={`/${npub}`} className="font-bold text-[15px] hover:underline block truncate" onClick={(e) => e.stopPropagation()}>
          {displayName}
        </Link>
        {about && <p className="text-sm text-muted-foreground line-clamp-1">{about}</p>}
      </div>

      {isOwner && !isSelf && (
        <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); onRemove(); }}>
          <X className="size-4" />
        </Button>
      )}

      {!isSelf && (
        <Button variant={isFollowed ? 'outline' : 'default'} size="sm" className="shrink-0" onClick={handleFollowToggle} disabled={isPending}>
          {isPending ? <Loader2 className="size-3.5 animate-spin" /> : isFollowed ? 'Following' : 'Follow'}
        </Button>
      )}
    </div>
  );
}

function MemberCardSkeleton() {
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

function CloneListDialog({
  open, onOpenChange, title: sourceTitle, description, image, pubkeys,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  image?: string;
  pubkeys: string[];
}) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();

  const [name, setName] = useState(`Copy of ${sourceTitle}`);
  const [isPending, setIsPending] = useState(false);

  // Reset name when dialog opens with a new source title
  useEffect(() => {
    if (open) setName(`Copy of ${sourceTitle}`);
  }, [open, sourceTitle]);

  const handleClone = async () => {
    if (!user || !name.trim()) return;

    setIsPending(true);
    try {
      const newDTag = crypto.randomUUID().replace(/-/g, '').slice(0, 16);

      const tags: string[][] = [['d', newDTag], ['title', name.trim()]];
      if (description) tags.push(['description', description]);
      if (image) tags.push(['image', image]);
      for (const pk of pubkeys) {
        tags.push(['p', pk]);
      }

      await publishEvent({ kind: 30000, content: '', tags });

      queryClient.invalidateQueries({ queryKey: ['personal-lists', user.pubkey] });

      const naddr = nip19.naddrEncode({ kind: 30000, pubkey: user.pubkey, identifier: newDTag });
      toast({ title: 'List cloned!', description: `"${name.trim()}" has been added to your lists.` });
      onOpenChange(false);
      navigate(`/${naddr}`);
    } catch (error) {
      console.error('Failed to clone list:', error);
      toast({ title: 'Failed to clone list', description: 'There was an error cloning this list.', variant: 'destructive' });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Clone List</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Input
              placeholder="List name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleClone(); }}
              autoFocus
            />
            <p className="text-sm text-muted-foreground mt-2">
              {pubkeys.length} member{pubkeys.length !== 1 ? 's' : ''} will be copied to your new list.
            </p>
          </div>
          <Button className="w-full" onClick={handleClone} disabled={!name.trim() || isPending}>
            {isPending ? <Loader2 className="size-4 animate-spin mr-2" /> : <CopyPlus className="size-4 mr-2" />}
            Clone List
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
