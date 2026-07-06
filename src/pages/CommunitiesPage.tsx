import { useState } from 'react';
import { Plus, UsersRound } from 'lucide-react';

import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CommunityCard } from '@/components/community/CommunityCard';
import { CreateCommunityDialog } from '@/components/community/CreateCommunityDialog';
import { useAppContext } from '@/hooks/useAppContext';
import { useCommunities, useJoinedCommunities } from '@/hooks/useCommunities';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useSeoMeta } from '@/hooks/useSeoMeta';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import type { Community } from '@/lib/community';

function CommunityListSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="overflow-hidden">
          <Skeleton className="h-20 w-full rounded-none" />
          <CardContent className="p-4 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** Discover, join, and create NIP-72 communities. */
export function CommunitiesPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const [createOpen, setCreateOpen] = useState(false);

  const discover = useCommunities();
  const { communities: joined, joinedCoords, isJoined, toggleJoin } = useJoinedCommunities();

  useSeoMeta({
    title: `Communities | ${config.appName}`,
    description: 'Moderated communities on Nostr',
  });

  useLayoutOptions({
    showFAB: !!user,
    onFabClick: () => setCreateOpen(true),
  });

  // Don't repeat joined communities in the discover grid.
  const joinedSet = new Set(joinedCoords);
  const discoverable = (discover.data ?? []).filter((c) => !joinedSet.has(c.coord));

  const renderGrid = (communities: Community[]) => (
    <div className="grid gap-3 sm:grid-cols-2">
      {communities.map((community) => (
        <CommunityCard
          key={community.coord}
          community={community}
          joined={isJoined(community.coord)}
          onToggleJoin={(coord) => toggleJoin.mutate(coord)}
          isToggling={toggleJoin.isPending}
        />
      ))}
    </div>
  );

  return (
    <>
      <PageHeader title="Communities" icon={<UsersRound className="size-5" />}>
        {user && (
          <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            <span className="hidden sm:inline">Create</span>
          </Button>
        )}
      </PageHeader>

      <div className="px-4 pb-8 space-y-8">
        {user && joined.length > 0 && (
          <section aria-label="Your communities" className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Your communities
            </h2>
            {renderGrid(joined)}
          </section>
        )}

        <section aria-label="Discover communities" className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Discover
          </h2>
          {discover.isLoading ? (
            <CommunityListSkeleton />
          ) : discoverable.length > 0 ? (
            renderGrid(discoverable)
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-12 px-8 text-center">
                <p className="text-muted-foreground max-w-sm mx-auto">
                  No communities found. Try checking your relay connections, or create the first one!
                </p>
              </CardContent>
            </Card>
          )}
        </section>
      </div>

      <CreateCommunityDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
