import { useMemo, useState } from 'react';
import { useNostr } from '@nostrify/react';
import { useQueryClient } from '@tanstack/react-query';
import { Share2, UsersRound } from 'lucide-react';
import { nip19 } from 'nostr-tools';

import { PageHeader } from '@/components/PageHeader';
import { SubHeaderBar } from '@/components/SubHeaderBar';
import { TabButton } from '@/components/TabButton';
import { ARC_OVERHANG_PX } from '@/components/ArcBackground';
import NotFound from '@/pages/NotFound';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { CommunityEmptyState } from '@/components/community/CommunityEmptyState';
import { CommunityPostCard } from '@/components/community/CommunityPostCard';
import { useAddrEvent } from '@/hooks/useEvent';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useJoinedCommunities } from '@/hooks/useCommunities';
import { useApproveCommunityPost, useCommunityPosts, type CommunityPost } from '@/hooks/useCommunityPosts';
import { usePostComment } from '@/hooks/usePostComment';
import { useSeoMeta } from '@/hooks/useSeoMeta';
import { useShareOrigin } from '@/hooks/useShareOrigin';
import { useToast } from '@/hooks/useToast';
import {
  COMMUNITY_KIND,
  communityModerators,
  communityRelayUrls,
  isCommunityModerator,
  parseCommunity,
} from '@/lib/community';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import type { ParsedAddr } from '@/lib/parseAddr';

interface CommunityPageProps {
  addr: ParsedAddr;
  relays?: string[];
}

function CommunityPageSkeleton() {
  return (
    <div>
      <Skeleton className="h-36 md:h-48 w-full rounded-none" />
      <div className="px-4 pb-4">
        <div className="flex justify-between items-start -mt-12 mb-3">
          <Skeleton className="size-24 rounded-full border-4 border-background" />
        </div>
        <Skeleton className="h-6 w-48 mb-2" />
        <Skeleton className="h-4 w-full" />
      </div>
      <div className="divide-y divide-border border-t border-border">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="px-4 py-3">
            <div className="flex items-center gap-3">
              <Skeleton className="size-11 rounded-full" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
            <div className="mt-3 space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Reddit-style community page: banner, join, post composer, and moderated feed. */
export function CommunityPage({ addr, relays }: CommunityPageProps) {
  const { config } = useAppContext();
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const shareOrigin = useShareOrigin();
  const queryClient = useQueryClient();

  const { data: event, isLoading } = useAddrEvent(addr, relays);
  const community = useMemo(() => (event ? parseCommunity(event) : undefined), [event]);

  const { isJoined, toggleJoin } = useJoinedCommunities();
  const postsQuery = useCommunityPosts(community);
  const approveMutation = useApproveCommunityPost();
  const { mutateAsync: postComment, isPending: isPosting } = usePostComment();

  const [draft, setDraft] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [tab, setTab] = useState<'posts' | 'pending'>('posts');

  useSeoMeta({
    title: community ? `${community.name} | ${config.appName}` : `Community | ${config.appName}`,
    description: community?.description || 'A moderated community on Nostr',
  });

  if (isLoading) {
    return (
      <main className="flex-1 min-w-0 min-h-dvh">
        <PageHeader title="Community" icon={<UsersRound className="size-5" />} backTo="/communities" />
        <CommunityPageSkeleton />
      </main>
    );
  }

  if (!event || event.kind !== COMMUNITY_KIND || !community) {
    return <NotFound />;
  }

  const image = sanitizeUrl(community.image);
  const isModerator = isCommunityModerator(community, user?.pubkey);
  const joined = isJoined(community.coord);
  const modCount = communityModerators(community).length;

  const naddr = nip19.naddrEncode({
    kind: COMMUNITY_KIND,
    pubkey: community.event.pubkey,
    identifier: community.identifier,
  });

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(`${shareOrigin}/${naddr}`);
      toast({ title: 'Link copied to clipboard' });
    } catch {
      toast({ title: 'Failed to copy link', variant: 'destructive' });
    }
  };

  const handleSubmitPost = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = draft.trim();
    if (!content) return;
    try {
      const published = await postComment({ root: event, content });
      // Best-effort delivery to the community's preferred relays (NIP-72).
      const relayUrls = communityRelayUrls(community);
      if (relayUrls.length > 0 && published) {
        nostr.group(relayUrls).event(published).catch(() => {});
      }
      setDraft('');
      setComposerOpen(false);
      // Only warn about the approval queue if this community actually uses it.
      const usesApprovals = (postsQuery.data ?? []).some((p) => p.approvals.length > 0);
      toast({
        title: 'Posted to community',
        description: isModerator || !usesApprovals
          ? undefined
          : 'Others will see your post once a moderator approves it.',
      });
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
    } catch {
      toast({ title: 'Failed to publish post', variant: 'destructive' });
    }
  };

  const handleApprove = (post: CommunityPost) => {
    approveMutation.mutate(post, {
      onSuccess: () => toast({ title: 'Post approved' }),
      onError: () => toast({ title: 'Failed to approve post', variant: 'destructive' }),
    });
  };

  // Approved posts plus the viewer's own pending posts (badged), so a fresh
  // submission never silently vanishes from the Posts tab.
  const allPosts = postsQuery.data ?? [];
  const visiblePosts = allPosts.filter((p) => p.approved || p.event.pubkey === user?.pubkey);
  const pendingPosts = allPosts.filter((p) => !p.approved);

  const renderPosts = (posts: CommunityPost[], emptyMessage: string) => {
    if (postsQuery.isLoading) {
      return (
        <div className="divide-y divide-border">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="px-4 py-3">
              <div className="flex items-center gap-3">
                <Skeleton className="size-11 rounded-full" />
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
              <div className="mt-3 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
              </div>
            </div>
          ))}
        </div>
      );
    }
    if (posts.length === 0) {
      return <CommunityEmptyState message={emptyMessage} />;
    }
    return (
      <div>
        {posts.map((post) => (
          <CommunityPostCard
            key={post.event.id}
            post={post}
            onApprove={handleApprove}
            isApproving={approveMutation.isPending}
          />
        ))}
      </div>
    );
  };

  return (
    <main className="flex-1 min-w-0 min-h-dvh">
      <PageHeader title={community.name} icon={<UsersRound className="size-5" />} backTo="/communities" />

      {/* Banner */}
      <div className="h-36 md:h-48 bg-secondary relative">
        {image ? (
          <img src={image} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-accent/10 via-transparent to-primary/5" />
        )}
      </div>

      {/* Info block */}
      <div className="px-4 pb-4">
        <div className="flex justify-between items-start -mt-12 md:-mt-16 mb-3">
          <Avatar className="size-24 md:size-32 border-4 border-background">
            <AvatarImage src={image} />
            <AvatarFallback className="bg-primary/20 text-primary">
              <UsersRound className="size-10" />
            </AvatarFallback>
          </Avatar>
          <div className="flex items-center gap-2 mt-14 md:mt-20">
            <Button
              variant="outline"
              size="icon"
              className="rounded-full size-10"
              onClick={handleShare}
              aria-label="Share community"
            >
              <Share2 className="size-4" />
            </Button>
            {user && (
              <Button
                variant={joined ? 'outline' : 'default'}
                className="rounded-full font-bold"
                disabled={toggleJoin.isPending}
                onClick={() => toggleJoin.mutate(community.coord)}
              >
                {joined ? 'Joined' : 'Join'}
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-xl font-bold truncate">{community.name}</h2>
          {isModerator && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground shrink-0">
              Moderator
            </span>
          )}
        </div>

        <div className="flex items-center gap-4 mt-1">
          <p className="text-sm">
            <span className="font-bold tabular-nums text-primary">{modCount}</span>{' '}
            <span className="text-muted-foreground">moderator{modCount !== 1 ? 's' : ''}</span>
          </p>
          <p className="text-sm">
            <span className="font-bold tabular-nums text-primary">{allPosts.length}</span>{' '}
            <span className="text-muted-foreground">post{allPosts.length !== 1 ? 's' : ''}</span>
          </p>
        </div>

        {community.description && (
          <p className="text-[15px] leading-relaxed mt-3 whitespace-pre-wrap break-words">
            {community.description}
          </p>
        )}
      </div>

      {/* Composer */}
      {user && (
        <div className="px-4 pb-3">
          {composerOpen ? (
            <form onSubmit={handleSubmitPost} className="space-y-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={`Share something with ${community.name}…`}
                rows={4}
                autoFocus
                maxLength={5000}
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="rounded-full"
                  onClick={() => {
                    setComposerOpen(false);
                    setDraft('');
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="rounded-full font-bold" disabled={isPosting || !draft.trim()}>
                  {isPosting ? 'Posting…' : 'Post'}
                </Button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setComposerOpen(true)}
              className="w-full text-left text-sm text-muted-foreground rounded-full border border-border bg-secondary/30 px-4 py-2.5 hover:bg-secondary/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Create a post…
            </button>
          )}
        </div>
      )}

      {/* Posts */}
      <SubHeaderBar>
        <TabButton label="Posts" active={tab === 'posts'} onClick={() => setTab('posts')} />
        <TabButton
          label={pendingPosts.length > 0 ? `Pending (${pendingPosts.length})` : 'Pending'}
          active={tab === 'pending'}
          onClick={() => setTab('pending')}
        />
      </SubHeaderBar>
      <div style={{ height: ARC_OVERHANG_PX }} />

      {tab === 'posts'
        ? renderPosts(visiblePosts, 'No approved posts yet. Be the first to post!')
        : renderPosts(pendingPosts, 'No posts awaiting approval.')}
    </main>
  );
}
