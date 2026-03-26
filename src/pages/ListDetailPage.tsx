/**
 * ListDetailPage
 *
 * Full-page detail view for a NIP-51 List (kind 30000).
 * Two tabs: Feed (posts from members) and Members (manage membership).
 */
import { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSeoMeta } from '@unhead/react';
import { nip19 } from 'nostr-tools';
import {
  Users, UserPlus, Loader2, X, Rss, Share2, Check, Copy, Quote, PanelLeft, Trash2,
} from 'lucide-react';
import { RepostIcon } from '@/components/icons/RepostIcon';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NoteCard } from '@/components/NoteCard';
import { PageHeader } from '@/components/PageHeader';
import { AddMembersDialog } from '@/components/AddMembersDialog';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useUserLists } from '@/hooks/useUserLists';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useAuthor } from '@/hooks/useAuthor';
import { useAuthors } from '@/hooks/useAuthors';
import { useFollowList, useFollowActions } from '@/hooks/useFollowActions';
import { useStreamPosts } from '@/hooks/useStreamPosts';
import { useMuteList } from '@/hooks/useMuteList';
import { isEventMuted } from '@/lib/muteHelpers';
import { genUserName } from '@/lib/genUserName';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { shareOrCopy } from '@/lib/share';
import { getRepostKind } from '@/lib/feedUtils';
import { DITTO_RELAY } from '@/lib/appRelays';
import { toast } from '@/hooks/useToast';
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { SubHeaderBar } from '@/components/SubHeaderBar';
import { TabButton } from '@/components/TabButton';
import { useLayoutOptions } from '@/contexts/LayoutContext';
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
  return { id, title, description, image, pubkeys, privatePubkeys: [], event };
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
  const avatarShape = getAvatarShape(metadata);
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
            <Avatar shape={avatarShape} className="size-10 shrink-0">
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
  const { mutate: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('feed');
  const [copied, setCopied] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const { addToSidebar, removeFromSidebar, orderedItems } = useFeedSettings();

  useLayoutOptions({ hasSubHeader: true });

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

  // Nostr URI for "Add to sidebar"
  const nostrUri = useMemo(() => {
    if (!naddr) return null;
    return `nostr:${naddr}`;
  }, [naddr]);

  const isInSidebar = useMemo(
    () => !!nostrUri && orderedItems.includes(nostrUri),
    [nostrUri, orderedItems],
  );

  const handleAddToSidebar = useCallback(() => {
    if (!nostrUri || isInSidebar) return;
    addToSidebar(nostrUri);
    toast({ title: 'Added to sidebar' });
  }, [nostrUri, isInSidebar, addToSidebar]);

  const handleRemoveFromSidebar = useCallback(() => {
    if (!nostrUri || !isInSidebar) return;
    removeFromSidebar(nostrUri);
    toast({ title: 'Removed from sidebar' });
  }, [nostrUri, isInSidebar, removeFromSidebar]);

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

  // Fetch the list author's profile
  const listAuthor = useAuthor(decoded?.pubkey ?? '');
  const listAuthorMetadata = listAuthor.data?.metadata;
  const listAuthorName = listAuthorMetadata?.name || listAuthorMetadata?.display_name || (decoded ? genUserName(decoded.pubkey) : '');
  const listAuthorAvatarShape = getAvatarShape(listAuthorMetadata);
  const listAuthorProfileUrl = useProfileUrl(decoded?.pubkey ?? '', listAuthorMetadata);

  // Fetch preview avatars for the member stack
  const previewPubkeys = useMemo(() => (list?.pubkeys ?? []).slice(0, 8), [list?.pubkeys]);
  const { data: previewMembersMap } = useAuthors(previewPubkeys);

  const handleShare = useCallback(async () => {
    const url = window.location.href;
    const result = await shareOrCopy(url, list?.title);
    if (result === 'copied') {
      setCopied(true);
      toast({ title: 'Link copied to clipboard' });
      setTimeout(() => setCopied(false), 2000);
    }
  }, [list?.title]);

  const handleRepost = useCallback(() => {
    const event = list?.event;
    if (!event) return;
    if (!user) {
      toast({ title: 'Please log in to repost', variant: 'destructive' });
      return;
    }

    const repostKind = getRepostKind(event.kind);
    const tags: string[][] = [
      ['e', event.id, DITTO_RELAY],
      ['p', event.pubkey],
    ];
    if (repostKind === 16) {
      tags.push(['k', String(event.kind)]);
      if (event.kind >= 30000 && event.kind < 40000) {
        const dTag = event.tags.find(([name]) => name === 'd')?.[1] ?? '';
        tags.push(['a', `${event.kind}:${event.pubkey}:${dTag}`]);
      }
    }

    publishEvent(
      { kind: repostKind, content: '', created_at: Math.floor(Date.now() / 1000), tags },
      {
        onSuccess: () => {
          toast({ title: 'Reposted!' });
          setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['event-stats', event.id] });
            queryClient.invalidateQueries({ queryKey: ['event-interactions', event.id] });
            queryClient.invalidateQueries({ queryKey: ['user-repost', event.id] });
          }, 3000);
        },
        onError: () => {
          toast({ title: 'Failed to repost', variant: 'destructive' });
        },
      },
    );
  }, [list?.event, user, publishEvent, queryClient]);

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
    description: list ? `${list.title} — ${list.pubkeys.length} members` : 'Nostr List',
  });

  // Loading state
  if (isLoading) {
    return (
      <main>
        <PageHeader onBack={() => navigate(-1)} titleContent={<Skeleton className="h-6 w-32" />} />
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
      {/* Header */}
      <PageHeader
          onBack={() => window.history.length > 1 ? navigate(-1) : navigate('/lists')}
          titleContent={
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold truncate">{list.title}</h1>
              {decoded && (
                <Link to={listAuthorProfileUrl} className="flex items-center gap-1.5 mt-0.5 group">
                  <Avatar shape={listAuthorAvatarShape} className="size-4">
                    <AvatarImage src={listAuthorMetadata?.picture} alt={listAuthorName} />
                    <AvatarFallback className="bg-primary/20 text-primary text-[8px]">
                      {listAuthorName[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs text-muted-foreground group-hover:underline truncate">
                    {listAuthorName}
                  </span>
                </Link>
              )}
            </div>
          }
        >
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full size-9"
                  title="Share"
                >
                  <Share2 className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={handleShare} className="gap-3">
                  {copied ? <Check className="size-4 text-green-500" /> : <Share2 className="size-4" />}
                  Share
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleRepost} className="gap-3">
                  <RepostIcon className="size-4" />
                  Repost
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setQuoteOpen(true)} className="gap-3">
                  <Quote className="size-4" />
                  Quote post
                </DropdownMenuItem>
                {nostrUri && (
                  isInSidebar ? (
                    <DropdownMenuItem onClick={handleRemoveFromSidebar} className="gap-3">
                      <Trash2 className="size-4" />
                      Remove from sidebar
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onClick={handleAddToSidebar} className="gap-3">
                      <PanelLeft className="size-4" />
                      Add to sidebar
                    </DropdownMenuItem>
                  )
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </PageHeader>

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

        {/* Member avatar stack */}
        {list.pubkeys.length > 0 && (
          <div className="flex items-center gap-2 px-4 pb-3">
            <div className="flex -space-x-2">
              {previewPubkeys.map((pk) => {
                const member = previewMembersMap?.get(pk);
                const name = member?.metadata?.name || genUserName(pk);
                const shape = getAvatarShape(member?.metadata);
                return (
                  <Avatar key={pk} shape={shape} className="size-7 ring-2 ring-background">
                    <AvatarImage src={member?.metadata?.picture} alt={name} />
                    <AvatarFallback className="bg-primary/20 text-primary text-[10px]">
                      {name[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                );
              })}
            </div>
            {list.pubkeys.length > previewPubkeys.length && (
              <button
                onClick={() => setActiveTab('members')}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                +{list.pubkeys.length - previewPubkeys.length} more
              </button>
            )}
          </div>
        )}

        {/* Tab bar */}
        <SubHeaderBar>
          <TabButton
            label="Feed"
            active={activeTab === 'feed'}
            onClick={() => setActiveTab('feed')}
          >
            <span className="flex items-center justify-center gap-1.5">
              <Rss className="size-4" />
              Feed
            </span>
          </TabButton>
          <TabButton
            label="Members"
            active={activeTab === 'members'}
            onClick={() => setActiveTab('members')}
          >
            <span className="flex items-center justify-center gap-1.5">
              <Users className="size-4" />
              Members
              <span className="text-xs text-muted-foreground">({list.pubkeys.length})</span>
            </span>
          </TabButton>
        </SubHeaderBar>

      {/* Tab content */}
      {activeTab === 'feed' ? (
        <ListFeedTab list={list} />
      ) : (
        <ListMembersTab list={list} isOwner={isOwnList} />
      )}

      {list.event && (
        <ReplyComposeModal
          quotedEvent={list.event}
          open={quoteOpen}
          onOpenChange={setQuoteOpen}
        />
      )}
    </main>
  );
}
