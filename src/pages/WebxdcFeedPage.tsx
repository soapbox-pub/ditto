import { useState, useMemo, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Blocks, Clock, Download, Plus, Loader2 } from 'lucide-react';
import { useSeoMeta } from '@unhead/react';
import { useInView } from 'react-intersection-observer';
import { useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { KindInfoButton } from '@/components/KindInfoButton';
import { WebxdcEmbed } from '@/components/WebxdcEmbed';
import { WebxdcUploadDialog } from '@/components/WebxdcUploadDialog';
import { PullToRefresh } from '@/components/PullToRefresh';
import { useAuthor } from '@/hooks/useAuthor';
import { useWebxdcFeed } from '@/hooks/useWebxdcFeed';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { getDisplayName } from '@/lib/getDisplayName';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { getExtraKindDef } from '@/lib/extraKinds';
import { timeAgo } from '@/lib/timeAgo';

const webxdcDef = getExtraKindDef('webxdc')!;

/** Extract the first value of a tag by name. */
function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

export function WebxdcFeedPage() {
  const { user } = useCurrentUser();
  const [uploadOpen, setUploadOpen] = useState(false);

  useSeoMeta({
    title: 'Webxdc | Ditto',
    description: 'Webxdc apps on Nostr',
  });

  useLayoutOptions({ showFAB: false });

  const queryClient = useQueryClient();
  const {
    data,
    isPending,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useWebxdcFeed();

  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['webxdc-feed'] });
  }, [queryClient]);

  // Flatten pages
  const apps = useMemo(() => {
    if (!data?.pages) return [];
    const seen = new Set<string>();
    return data.pages
      .flatMap((page) => page.items)
      .filter((event) => {
        if (seen.has(event.id)) return false;
        seen.add(event.id);
        return true;
      });
  }, [data?.pages]);

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

  // Auto-fetch page 2
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && data?.pages?.length === 1) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, data?.pages?.length, fetchNextPage]);

  const showSkeleton = isPending || (isLoading && !data);

  return (
    <main className="min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 mt-4 mb-5">
        <Link to="/" className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors sidebar:hidden">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Blocks className="size-5" />
          <h1 className="text-xl font-bold">Webxdc</h1>
        </div>
        <KindInfoButton kindDef={webxdcDef} icon={<Blocks className="size-5" />} />
      </div>

      {/* Feed */}
      <PullToRefresh onRefresh={handleRefresh}>
        {showSkeleton ? (
          <div className="space-y-3 px-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <WebxdcCardSkeleton key={i} />
            ))}
          </div>
        ) : apps.length === 0 ? (
          <div className="px-4">
            <Card className="border-dashed">
              <CardContent className="py-12 px-8 text-center">
                <div className="max-w-sm mx-auto space-y-2">
                  <Blocks className="size-8 text-muted-foreground/40 mx-auto" />
                  <p className="text-muted-foreground">
                    No webxdc apps found yet. Check your relay connections or try again later.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="space-y-3 px-4 pb-8">
            {apps.map((event) => (
              <WebxdcAppCard key={event.id} event={event} />
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
        )}
      </PullToRefresh>

      {/* Upload FAB */}
      {user && (
        <div className="sticky bottom-fab sidebar:bottom-6 z-30 pointer-events-none flex justify-end pr-6">
          <div className="pointer-events-auto">
            <Button
              onClick={() => setUploadOpen(true)}
              className="size-14 rounded-full shadow-lg bg-accent hover:bg-accent/90 text-accent-foreground transition-transform hover:scale-105 active:scale-95"
            >
              <Plus strokeWidth={4} />
            </Button>
          </div>
        </div>
      )}

      <WebxdcUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </main>
  );
}

function WebxdcAppCard({ event }: { event: NostrEvent }) {
  const url = getTag(event.tags, 'url') ?? '';
  const alt = getTag(event.tags, 'alt');
  const webxdcId = getTag(event.tags, 'webxdc');
  const description = event.content || alt;

  // Derive a display name from the alt tag or URL
  const appName = alt?.replace(/^Webxdc app:\s*/i, '') ?? url.split('/').pop()?.replace('.xdc', '') ?? 'Webxdc App';

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 space-y-3">
        {/* Author + meta header */}
        <div className="flex items-start gap-2.5">
          <WebxdcCardAuthor pubkey={event.pubkey} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm leading-snug line-clamp-1">{appName}</h3>
              <Badge variant="secondary" className="text-[10px] shrink-0">
                <Blocks className="size-2.5 mr-0.5" />
                xdc
              </Badge>
            </div>
            {description && (
              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{description}</p>
            )}
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="size-3" />
                {timeAgo(event.created_at)}
              </span>
            </div>
          </div>
        </div>

        {/* Webxdc embed */}
        {url && (
          <WebxdcEmbed
            url={url}
            uuid={webxdcId}
            name={appName}
          />
        )}

        {/* Download link */}
        {url && (
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground gap-1.5"
              asChild
            >
              <a href={url} download>
                <Download className="size-3.5" />
                Download .xdc
              </a>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WebxdcCardAuthor({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = getDisplayName(metadata, pubkey);
  const profileUrl = useProfileUrl(pubkey, metadata);

  if (author.isLoading) {
    return <Skeleton className="size-9 rounded-full shrink-0" />;
  }

  return (
    <Link to={profileUrl} className="shrink-0" onClick={(e) => e.stopPropagation()}>
      <Avatar className="size-9">
        <AvatarImage src={metadata?.picture} alt={displayName} />
        <AvatarFallback className="bg-primary/20 text-primary text-xs">
          {displayName[0]?.toUpperCase()}
        </AvatarFallback>
      </Avatar>
    </Link>
  );
}

function WebxdcCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start gap-2.5">
          <Skeleton className="size-9 rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </div>
        <Skeleton className="h-40 w-full mt-3 rounded-2xl" />
      </CardContent>
    </Card>
  );
}
