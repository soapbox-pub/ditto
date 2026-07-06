import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Compass, Plus, UsersRound } from 'lucide-react';
import { nip19 } from 'nostr-tools';

import { PageHeader } from '@/components/PageHeader';
import { SubHeaderBar } from '@/components/SubHeaderBar';
import { TabButton } from '@/components/TabButton';
import { ARC_OVERHANG_PX } from '@/components/ArcBackground';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CommunityCard } from '@/components/community/CommunityCard';
import { CommunityEmptyState } from '@/components/community/CommunityEmptyState';
import { CommunityPostCard } from '@/components/community/CommunityPostCard';
import { CreateCommunityDialog } from '@/components/community/CreateCommunityDialog';
import { useAppContext } from '@/hooks/useAppContext';
import { useCommunities, useJoinedCommunities } from '@/hooks/useCommunities';
import { useApproveCommunityPost, useCommunitiesFeed, type CommunityPost } from '@/hooks/useCommunityPosts';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useSeoMeta } from '@/hooks/useSeoMeta';
import { useToast } from '@/hooks/useToast';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { COMMUNITY_KIND, type Community } from '@/lib/community';

function PostRowSkeleton() {
  return (
    <div className="px-4 py-3">
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
  );
}

function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Skeleton className="size-11 rounded-full" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-3/5" />
      </div>
      <Skeleton className="h-8 w-16 rounded-full" />
    </div>
  );
}

/** Horizontal strip of the user's joined communities for quick navigation. */
function JoinedCommunitiesStrip({ communities }: { communities: Community[] }) {
  if (communities.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-none px-4 py-3 border-b border-border">
      {communities.map((community) => {
        const image = sanitizeUrl(community.image);
        const naddr = nip19.naddrEncode({
          kind: COMMUNITY_KIND,
          pubkey: community.event.pubkey,
          identifier: community.identifier,
        });
        return (
          <Link
            key={community.coord}
            to={`/${naddr}`}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card pl-1 pr-3 py-1 text-sm font-medium hover:bg-secondary transition-colors shrink-0"
          >
            {image ? (
              <img src={image} alt="" className="size-6 rounded-full object-cover" loading="lazy" />
            ) : (
              <span className="size-6 rounded-full bg-primary/20 flex items-center justify-center">
                <UsersRound className="size-3.5 text-primary" />
              </span>
            )}
            <span className="truncate max-w-36">c/{community.name}</span>
          </Link>
        );
      })}
    </div>
  );
}

/** Reddit-style communities home: aggregated post feed + discovery directory. */
export function CommunitiesPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [tab, setTab] = useState<'feed' | 'discover'>(user ? 'feed' : 'discover');

  const discover = useCommunities();
  const joined = useJoinedCommunities();
  const feed = useCommunitiesFeed(joined.communities);
  const approveMutation = useApproveCommunityPost();

  useSeoMeta({
    title: `Communities | ${config.appName}`,
    description: 'Moderated communities on Nostr',
  });

  useLayoutOptions({
    showFAB: !!user,
    onFabClick: () => setCreateOpen(true),
    hasSubHeader: true,
  });

  const handleApprove = (post: CommunityPost) => {
    approveMutation.mutate(post, {
      onSuccess: () => toast({ title: 'Post approved' }),
      onError: () => toast({ title: 'Failed to approve post', variant: 'destructive' }),
    });
  };

  // The home feed shows approved posts plus the viewer's own pending posts
  // (marked with a badge), so your submission never silently vanishes.
  const feedPosts = (feed.data ?? []).filter(
    (post) => post.approved || post.event.pubkey === user?.pubkey,
  );

  const isFeedLoading = joined.isLoading || (joined.communities.length > 0 && feed.isLoading);

  const renderFeedTab = () => {
    if (!user) {
      return (
        <CommunityEmptyState message="Log in and join communities to build your personal feed.">
          <Button variant="outline" className="rounded-full" onClick={() => setTab('discover')}>
            <Compass className="size-4 mr-1.5" />
            Browse communities
          </Button>
        </CommunityEmptyState>
      );
    }
    if (isFeedLoading) {
      return (
        <div className="divide-y divide-border">
          {Array.from({ length: 4 }).map((_, i) => <PostRowSkeleton key={i} />)}
        </div>
      );
    }
    if (joined.communities.length === 0) {
      return (
        <CommunityEmptyState message="You haven't joined any communities yet. Join a few to fill this feed with their posts.">
          <Button variant="outline" className="rounded-full" onClick={() => setTab('discover')}>
            <Compass className="size-4 mr-1.5" />
            Discover communities
          </Button>
        </CommunityEmptyState>
      );
    }
    return (
      <>
        <JoinedCommunitiesStrip communities={joined.communities} />
        {feedPosts.length === 0 ? (
          <CommunityEmptyState message="No posts in your communities yet. Open one and start the conversation!" />
        ) : (
          <div>
            {feedPosts.map((post) => (
              <CommunityPostCard
                key={post.event.id}
                post={post}
                showCommunity
                onApprove={handleApprove}
                isApproving={approveMutation.isPending}
              />
            ))}
          </div>
        )}
      </>
    );
  };

  const renderDiscoverTab = () => {
    if (discover.isLoading) {
      return (
        <div className="divide-y divide-border">
          {Array.from({ length: 6 }).map((_, i) => <RowSkeleton key={i} />)}
        </div>
      );
    }
    const communities = discover.data ?? [];
    if (communities.length === 0) {
      return (
        <CommunityEmptyState message="No communities found. Try checking your relay connections, or create the first one!" />
      );
    }
    return (
      <div>
        {communities.map((community) => (
          <CommunityCard
            key={community.coord}
            community={community}
            joined={joined.isJoined(community.coord)}
            onToggleJoin={(coord) => joined.toggleJoin.mutate(coord)}
            isToggling={joined.toggleJoin.isPending}
          />
        ))}
      </div>
    );
  };

  return (
    <main className="flex-1 min-w-0 min-h-dvh">
      <PageHeader title="Communities" icon={<UsersRound className="size-5" />}>
        {user && (
          <Button size="sm" className="rounded-full font-bold gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            <span className="hidden sm:inline">Create</span>
          </Button>
        )}
      </PageHeader>

      <SubHeaderBar>
        <TabButton label="Feed" active={tab === 'feed'} onClick={() => setTab('feed')} />
        <TabButton label="Discover" active={tab === 'discover'} onClick={() => setTab('discover')} />
      </SubHeaderBar>
      <div style={{ height: ARC_OVERHANG_PX }} />

      {tab === 'feed' ? renderFeedTab() : renderDiscoverTab()}

      <CreateCommunityDialog open={createOpen} onOpenChange={setCreateOpen} />
    </main>
  );
}
