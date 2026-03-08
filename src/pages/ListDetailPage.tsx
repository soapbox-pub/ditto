/**
 * ListDetailPage
 *
 * Full-page detail view for a NIP-51 Follow Set (kind 30000).
 * Two tabs: Feed (posts from members) and Members (manage membership).
 */
import { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useSeoMeta } from '@unhead/react';
import { nip19 } from 'nostr-tools';
import {
  ArrowLeft, Users, UserPlus, Loader2, X, Rss, Share2, Check, Copy,
} from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { NoteCard } from '@/components/NoteCard';
import { AddMembersDialog } from '@/components/AddMembersDialog';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useUserLists } from '@/hooks/useUserLists';
import { useAuthor } from '@/hooks/useAuthor';
import { useFollowList, useFollowActions } from '@/hooks/useFollowActions';
import { useStreamPosts } from '@/hooks/useStreamPosts';
import { useMuteList } from '@/hooks/useMuteList';
import { isEventMuted } from '@/lib/muteHelpers';
import { genUserName } from '@/lib/genUserName';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { toast } from '@/hooks/useToast';
import { cn, STICKY_HEADER_CLASS } from '@/lib/utils';
import type { NostrEvent } from '@nostrify/nostrify';
import type { UserList } from '@/hooks/useUserLists';
import NotFound from './NotFound';

/** Parse a kind 30000 event into a UserList shape (for remote lists). */
function parseRemoteList(event: NostrEvent): UserList {
  const getTag = (name: string) => event.tags.find(([n]) => n === name)?.[1];
  const id = getTag('d') ?? '';
  const title = getTag('title') || getTag('name') || id;
  const description = getTag('description') || getTag('summary') || undefined;
  const image = getTag('image') || getTag('thumb') || undefined;
  const pubkeys = event.tags.filter(([n]) => n === 'p').map(([, pk]) => pk);
  return { id, title, description, image, pubkeys, event };
}

type Tab = 'feed' | 'members';

// ─── Member Card ──────────────────────────────────────────────────────────────

function MemberCard({ pubkey, isOwner, listId, onRemoved }: {
  pubkey: string;
  isOwner: boolean;
  listId: string;
  onRemoved?: () => void;
}) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.display_name || metadata?.name || genUserName(pubkey);
  const profileUrl = useProfileUrl(pubkey, metadata);
  const { data: followData } = useFollowList();
  const { follow, unfollow, isPending: followPending } = useFollowActions();
  const { user } = useCurrentUser();
  const { removeFromList } = useUserLists();
  const [removing, setRemoving] = useState(false);

  const isFollowed = useMemo(
    () => followData?.pubkeys.includes(pubkey) ?? false,
    [followData?.pubkeys, pubkey],
  );
  const isSelf = user?.pubkey === pubkey;

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await removeFromList.mutateAsync({ listId, pubkey });
      toast({ title: 'Removed from list' });
      onRemoved?.();
    } catch {
      toast({ title: 'Failed to remove', variant: 'destructive' });
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors group">
      <Link to={profileUrl} className="flex items-center gap-3 flex-1 min-w-0">
        {author.isLoading ? (
          <>
            <Skeleton className="size-10 rounded-full shrink-0" />
            <div className="space-y-1 flex-1">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-36" />
            </div>
          </>
        ) : (
          <>
            <Avatar className="size-10 shrink-0">
              <AvatarImage src={metadata?.picture} alt={displayName} />
              <AvatarFallback className="bg-primary/20 text-primary text-sm">
                {displayName[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold truncate">{displayName}</div>
              {metadata?.nip05 && (
                <div className="text-xs text-muted-foreground truncate">{metadata.nip05}</div>
              )}
              {metadata?.about && (
                <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{metadata.about}</div>
              )}
            </div>
          </>
        )}
      </Link>

      <div className="flex items-center gap-1.5 shrink-0">
        {/* Follow/Unfollow button */}
        {!isSelf && user && (
          <Button
            size="sm"
            variant={isFollowed ? 'outline' : 'default'}
            className="h-7 px-2.5 text-xs"
            disabled={followPending}
            onClick={() => isFollowed ? unfollow(pubkey) : follow(pubkey)}
          >
            {followPending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : isFollowed ? 'Following' : 'Follow'}
          </Button>
        )}

        {/* Remove button (owner only) */}
        {isOwner && (
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

// ─── Feed Tab ─────────────────────────────────────────────────────────────────

function ListFeedTab({ list }: { list: UserList }) {
  const { muteItems } = useMuteList();

  const { posts, isLoading } = useStreamPosts('', {
    includeReplies: false,
    mediaType: 'all',
    authorPubkeys: list.pubkeys,
  });

  const filteredPosts = useMemo(() => {
    if (muteItems.length === 0) return posts;
    return posts.filter((e) => !isEventMuted(e, muteItems));
  }, [posts, muteItems]);

  if (list.pubkeys.length === 0) {
    return (
      <div className="py-16 text-center text-muted-foreground">
        <Users className="size-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No members in this list yet.</p>
        <p className="text-xs mt-1">Add members to see their posts here.</p>
      </div>
    );
  }

  if (isLoading && filteredPosts.length === 0) {
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

  if (filteredPosts.length === 0) {
    return (
      <div className="py-16 text-center text-muted-foreground text-sm">
        No posts from list members yet.
      </div>
    );
  }

  return (
    <div>
      {filteredPosts.map((event) => (
        <NoteCard key={event.id} event={event} />
      ))}
    </div>
  );
}

// ─── Members Tab ──────────────────────────────────────────────────────────────

function ListMembersTab({ list, isOwner }: { list: UserList; isOwner: boolean }) {
  const [addMembersOpen, setAddMembersOpen] = useState(false);

  return (
    <div>
      {isOwner && (
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

      {list.pubkeys.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          <Users className="size-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No members yet.</p>
          {isOwner && (
            <p className="text-xs mt-1">Click "Add Members" to search for people.</p>
          )}
        </div>
      ) : (
        list.pubkeys.map((pk) => (
          <MemberCard
            key={pk}
            pubkey={pk}
            isOwner={isOwner}
            listId={list.id}
          />
        ))
      )}

      {isOwner && (
        <AddMembersDialog
          open={addMembersOpen}
          onOpenChange={setAddMembersOpen}
          listId={list.id}
          listPubkeys={list.pubkeys}
        />
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ListDetailPage() {
  const params = useParams<{ nip19: string }>();
  const naddr = params.nip19;
  const navigate = useNavigate();
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { lists, isLoading: ownListsLoading, createList } = useUserLists();
  const [activeTab, setActiveTab] = useState<Tab>('feed');
  const [copied, setCopied] = useState(false);
  const [cloning, setCloning] = useState(false);

  // Decode the naddr to get the d-tag identifier and author
  const decoded = useMemo(() => {
    if (!naddr) return null;
    try {
      const result = nip19.decode(naddr);
      if (result.type === 'naddr' && result.data.kind === 30000) {
        return result.data;
      }
    } catch {
      // Invalid naddr
    }
    return null;
  }, [naddr]);

  const isOwnList = !!(decoded && user && decoded.pubkey === user.pubkey);

  // For own lists, use the local cache
  const ownList = useMemo(
    () => (isOwnList && decoded) ? lists.find((l) => l.id === decoded.identifier) ?? null : null,
    [lists, decoded, isOwnList],
  );

  // For other people's lists, query the relay
  const remoteListQuery = useQuery({
    queryKey: ['remote-list', decoded?.pubkey, decoded?.identifier],
    queryFn: async ({ signal }) => {
      if (!decoded) return null;
      const events = await nostr.query(
        [{ kinds: [30000], authors: [decoded.pubkey], '#d': [decoded.identifier], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) },
      );
      if (events.length === 0) return null;
      return parseRemoteList(events[0]);
    },
    enabled: !!decoded && !isOwnList,
    staleTime: 60 * 1000,
  });

  // Unified list object — own list takes priority
  const list = isOwnList ? ownList : (remoteListQuery.data ?? null);
  const isLoading = isOwnList ? ownListsLoading : remoteListQuery.isLoading;

  const handleCopyLink = useCallback(() => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      toast({ title: 'Link copied to clipboard' });
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  const handleClone = useCallback(async () => {
    if (!list || !user || cloning) return;
    setCloning(true);
    try {
      await createList.mutateAsync({
        title: list.title,
        description: list.description,
        pubkeys: list.pubkeys,
      });
      toast({ title: `List "${list.title}" saved to your lists` });
    } catch {
      toast({ title: 'Failed to save list', variant: 'destructive' });
    } finally {
      setCloning(false);
    }
  }, [list, user, cloning, createList]);

  useSeoMeta({
    title: list ? `${list.title} | ${config.appName}` : `List | ${config.appName}`,
    description: list ? `${list.title} — ${list.pubkeys.length} members` : 'Nostr Follow Set',
  });

  // Loading state
  if (isLoading) {
    return (
      <main>
        <div className={cn(STICKY_HEADER_CLASS, 'flex items-center gap-4 px-4 pt-4 pb-3 bg-background/80 backdrop-blur-md z-10')}>
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-full hover:bg-secondary transition-colors sidebar:hidden"
          >
            <ArrowLeft className="size-5" />
          </button>
          <Skeleton className="h-6 w-32" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="px-4 py-3">
              <div className="flex gap-3">
                <Skeleton className="size-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    );
  }

  // Not found
  if (!list) {
    return <NotFound />;
  }

  return (
    <main>
      {/* Sticky header */}
      <div className={cn(STICKY_HEADER_CLASS, 'bg-background/80 backdrop-blur-md z-10')}>
        <div className="flex items-center gap-4 px-4 pt-4 pb-3">
          <button
            onClick={() => window.history.length > 1 ? navigate(-1) : navigate('/lists')}
            className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors sidebar:hidden"
          >
            <ArrowLeft className="size-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold truncate">{list.title}</h1>
            <p className="text-xs text-muted-foreground">
              {list.pubkeys.length} {list.pubkeys.length === 1 ? 'member' : 'members'}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {user && !isOwnList && (
              <Button
                variant="outline"
                size="sm"
                className="rounded-full gap-1.5 h-8"
                onClick={handleClone}
                disabled={cloning}
              >
                {cloning
                  ? <Loader2 className="size-3.5 animate-spin" />
                  : <Copy className="size-3.5" />
                }
                Save
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full size-9"
              onClick={handleCopyLink}
              title="Copy link"
            >
              {copied
                ? <Check className="size-4 text-green-500" />
                : <Share2 className="size-4" />
              }
            </Button>
          </div>
        </div>

        {/* Description and image */}
        {(list.description || list.image) && (
          <div className="px-4 pb-3">
            {list.image && (
              <div className="rounded-xl overflow-hidden mb-2">
                <img
                  src={list.image}
                  alt={list.title}
                  className="w-full max-h-[160px] object-cover"
                  loading="lazy"
                  onError={(e) => {
                    (e.currentTarget.parentElement as HTMLElement).style.display = 'none';
                  }}
                />
              </div>
            )}
            {list.description && (
              <p className="text-sm text-muted-foreground leading-relaxed">{list.description}</p>
            )}
          </div>
        )}



        {/* Tab bar */}
        <div className="flex border-b border-border">
          <button
            className={cn(
              'flex-1 py-2.5 text-sm font-medium text-center transition-colors relative',
              activeTab === 'feed'
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setActiveTab('feed')}
          >
            <span className="flex items-center justify-center gap-1.5">
              <Rss className="size-4" />
              Feed
            </span>
            {activeTab === 'feed' && (
              <div className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-primary rounded-full" />
            )}
          </button>
          <button
            className={cn(
              'flex-1 py-2.5 text-sm font-medium text-center transition-colors relative',
              activeTab === 'members'
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setActiveTab('members')}
          >
            <span className="flex items-center justify-center gap-1.5">
              <Users className="size-4" />
              Members
              <span className="text-xs text-muted-foreground">({list.pubkeys.length})</span>
            </span>
            {activeTab === 'members' && (
              <div className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-primary rounded-full" />
            )}
          </button>
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'feed' ? (
        <ListFeedTab list={list} />
      ) : (
        <ListMembersTab list={list} isOwner={isOwnList} />
      )}
    </main>
  );
}
