import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Share2, ShieldCheck, UsersRound } from 'lucide-react';
import { nip19 } from 'nostr-tools';

import { PageHeader } from '@/components/PageHeader';
import NotFound from '@/pages/NotFound';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
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
    <div className="px-4 space-y-4">
      <Skeleton className="h-36 w-full rounded-xl" />
      <div className="space-y-2">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-28 w-full rounded-xl" />
      ))}
    </div>
  );
}

/** Reddit-style community page: banner, join, post composer, and moderated feed. */
export function CommunityPage({ addr, relays }: CommunityPageProps) {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const shareOrigin = useShareOrigin();
  const queryClient = useQueryClient();

  const { data: event, isLoading } = useAddrEvent(addr, relays);
  const community = useMemo(() => (event ? parseCommunity(event) : undefined), [event]);

  const { isJoined, toggleJoin } = useJoinedCommunities();
  const postsQuery = useCommunityPosts(community);
  const approveMutation = useApproveCommunityPost(community);
  const { mutateAsync: postComment, isPending: isPosting } = usePostComment();

  const [draft, setDraft] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);

  useSeoMeta({
    title: community ? `${community.name} | ${config.appName}` : `Community | ${config.appName}`,
    description: community?.description || 'A moderated community on Nostr',
  });

  if (isLoading) {
    return (
      <>
        <PageHeader title="Community" icon={<UsersRound className="size-5" />} backTo="/communities" />
        <CommunityPageSkeleton />
      </>
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
      await postComment({ root: event, content });
      setDraft('');
      setComposerOpen(false);
      toast({
        title: 'Posted to community',
        description: isModerator ? undefined : 'Your post will appear once a moderator approves it.',
      });
      queryClient.invalidateQueries({ queryKey: ['community-posts', community.coord] });
    } catch {
      toast({ title: 'Failed to publish post', variant: 'destructive' });
    }
  };

  const handleApprove = (post: CommunityPost) => {
    approveMutation.mutate(post.event, {
      onSuccess: () => toast({ title: 'Post approved' }),
      onError: () => toast({ title: 'Failed to approve post', variant: 'destructive' }),
    });
  };

  const renderPosts = (posts: CommunityPost[], emptyMessage: string) => {
    if (postsQuery.isLoading) {
      return (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      );
    }
    if (posts.length === 0) {
      return (
        <Card className="border-dashed">
          <CardContent className="py-12 px-8 text-center">
            <p className="text-muted-foreground max-w-sm mx-auto">{emptyMessage}</p>
          </CardContent>
        </Card>
      );
    }
    return (
      <div className="space-y-3">
        {posts.map((post) => (
          <CommunityPostCard
            key={post.event.id}
            post={post}
            isModerator={isModerator}
            onApprove={handleApprove}
            isApproving={approveMutation.isPending}
          />
        ))}
      </div>
    );
  };

  const pendingCount = postsQuery.data?.pending.length ?? 0;

  return (
    <>
      <PageHeader title={community.name} icon={<UsersRound className="size-5" />} backTo="/communities" />

      <div className="px-4 pb-8 space-y-4">
        {/* Banner */}
        <div className="relative rounded-xl overflow-hidden">
          {image ? (
            <img src={image} alt="" className="w-full aspect-[3/1] object-cover" />
          ) : (
            <div className="w-full aspect-[3/1] bg-gradient-to-br from-primary/20 via-primary/5 to-transparent flex items-center justify-center">
              <UsersRound className="size-12 text-primary/25" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between gap-3 p-4">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-white drop-shadow-lg truncate">
                {community.name}
              </h1>
              <p className="text-xs text-white/85 drop-shadow">
                {modCount} moderator{modCount !== 1 ? 's' : ''}
                {isModerator && ' · You moderate this community'}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="icon"
                variant="secondary"
                className="size-8 bg-white/15 hover:bg-white/25 text-white border-0 backdrop-blur"
                onClick={handleShare}
                aria-label="Share community"
              >
                <Share2 className="size-3.5" />
              </Button>
              {user && (
                <Button
                  size="sm"
                  variant={joined ? 'secondary' : 'default'}
                  disabled={toggleJoin.isPending}
                  onClick={() => toggleJoin.mutate(community.coord)}
                >
                  {joined ? 'Joined' : 'Join'}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Description */}
        {community.description && (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
            {community.description}
          </p>
        )}

        {/* Composer */}
        {user && (
          <Card>
            <CardContent className="p-3">
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
                      onClick={() => {
                        setComposerOpen(false);
                        setDraft('');
                      }}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" size="sm" disabled={isPosting || !draft.trim()}>
                      {isPosting ? 'Posting…' : 'Post'}
                    </Button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setComposerOpen(true)}
                  className="w-full text-left text-sm text-muted-foreground rounded-md border border-input bg-background px-3 py-2.5 hover:bg-secondary/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Create a post…
                </button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Posts */}
        <Tabs defaultValue="posts">
          <TabsList>
            <TabsTrigger value="posts">Posts</TabsTrigger>
            <TabsTrigger value="pending" className="gap-1.5">
              {isModerator && <ShieldCheck className="size-3.5" />}
              Pending
              {pendingCount > 0 && (
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                  {pendingCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="posts" className="mt-3">
            {renderPosts(
              postsQuery.data?.approved ?? [],
              'No approved posts yet. Be the first to post!',
            )}
          </TabsContent>
          <TabsContent value="pending" className="mt-3">
            {renderPosts(
              postsQuery.data?.pending ?? [],
              'No posts awaiting approval.',
            )}
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
