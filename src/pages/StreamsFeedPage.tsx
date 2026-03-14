import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Radio, Users, Clock } from 'lucide-react';
import { sidebarItemIcon } from '@/lib/sidebarItems';
import { useSeoMeta } from '@unhead/react';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import { useAppContext } from '@/hooks/useAppContext';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { KindInfoButton } from '@/components/KindInfoButton';
import { useAuthor } from '@/hooks/useAuthor';
import { useStreamKind } from '@/hooks/useStreamKind';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { getDisplayName } from '@/lib/getDisplayName';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useOpenPost } from '@/hooks/useOpenPost';
import { getExtraKindDef } from '@/lib/extraKinds';
import { timeAgo } from '@/lib/timeAgo';
import { cn } from '@/lib/utils';

const streamsDef = getExtraKindDef('streams')!;

/** Extract the first value of a tag by name. */
function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

/** Status badge config. */
function getStatusConfig(status: string | undefined) {
  switch (status) {
    case 'live':
      return { label: 'LIVE', className: 'bg-red-600 hover:bg-red-600 text-white border-red-600' };
    case 'ended':
      return { label: 'ENDED', className: 'bg-muted text-muted-foreground border-border' };
    case 'planned':
      return { label: 'PLANNED', className: 'bg-blue-600/90 hover:bg-blue-600/90 text-white border-blue-600' };
    default:
      return { label: status?.toUpperCase() || 'UNKNOWN', className: 'bg-muted text-muted-foreground border-border' };
  }
}

export function StreamsFeedPage() {
  const { config } = useAppContext();

  useSeoMeta({
    title: `Streams | ${config.appName}`,
    description: 'Live streams on Nostr',
  });

  useLayoutOptions({ showFAB: true, fabKind: 30311 });

  const { events, isLoading } = useStreamKind(30311);

  // Sort: live first, then planned, then ended. Within each group, newest first.
  const sorted = useMemo(() => {
    const statusOrder: Record<string, number> = { live: 0, planned: 1, ended: 2 };
    return [...events].sort((a, b) => {
      const aStatus = getTag(a.tags, 'status') || 'ended';
      const bStatus = getTag(b.tags, 'status') || 'ended';
      const orderDiff = (statusOrder[aStatus] ?? 3) - (statusOrder[bStatus] ?? 3);
      if (orderDiff !== 0) return orderDiff;
      return b.created_at - a.created_at;
    });
  }, [events]);

  return (
      <main className="">
        {/* Header */}
        <div className="flex items-center gap-4 px-4 pt-4 pb-5">
          <Link to="/" className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors sidebar:hidden">
            <ArrowLeft className="size-5" />
          </Link>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Radio className="size-5" />
            <h1 className="text-xl font-bold">Streams</h1>
          </div>
          <KindInfoButton kindDef={streamsDef} icon={sidebarItemIcon('streams', 'size-5')} />
        </div>

        {/* Feed */}
        {isLoading && events.length === 0 ? (
          <div className="space-y-3 px-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <StreamCardSkeleton key={i} />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="px-4">
            <Card className="border-dashed">
              <CardContent className="py-12 px-8 text-center">
                <div className="max-w-sm mx-auto space-y-2">
                  <Radio className="size-8 text-muted-foreground/40 mx-auto" />
                  <p className="text-muted-foreground">
                    No streams found. Check your relay connections or wait for new streams to start.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="space-y-3 px-4 pb-8">
            {sorted.map((event) => (
              <StreamCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </main>
  );
}

function StreamCard({ event }: { event: NostrEvent }) {
  const title = getTag(event.tags, 'title') || 'Untitled Stream';
  const summary = getTag(event.tags, 'summary');
  const imageUrl = getTag(event.tags, 'image');
  const status = getTag(event.tags, 'status');
  const currentParticipants = getTag(event.tags, 'current_participants');
  const statusConfig = getStatusConfig(status);

  const naddrId = useMemo(() => {
    const dTag = getTag(event.tags, 'd') || '';
    return nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier: dTag });
  }, [event]);

  const { onClick, onAuxClick } = useOpenPost(`/${naddrId}`);

  return (
    <Card
      className="overflow-hidden cursor-pointer hover:bg-secondary/30 transition-colors"
      onClick={onClick}
      onAuxClick={onAuxClick}
    >
      {/* Thumbnail */}
      {imageUrl && (
        <div className="relative w-full aspect-video overflow-hidden bg-muted">
          <img
            src={imageUrl}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => {
              (e.currentTarget.parentElement as HTMLElement).style.display = 'none';
            }}
          />
          {/* Status badge overlay */}
          <div className="absolute top-2 left-2">
            <Badge variant="outline" className={cn('text-[10px]', statusConfig.className)}>
              {status === 'live' && <div className="size-1.5 bg-white rounded-full animate-pulse mr-1" />}
              {statusConfig.label}
            </Badge>
          </div>
          {/* Viewer count overlay */}
          {currentParticipants && (
            <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/60 text-white text-xs px-2 py-0.5 rounded">
              <Users className="size-3" />
              {currentParticipants}
            </div>
          )}
        </div>
      )}

      <CardContent className="p-3 space-y-2">
        {/* Author + meta */}
        <div className="flex items-start gap-2.5">
          <StreamCardAuthor pubkey={event.pubkey} />
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm leading-snug line-clamp-2">{title}</h3>
            {summary && (
              <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{summary}</p>
            )}
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              {!imageUrl && (
                <Badge variant="outline" className={cn('text-[10px]', statusConfig.className)}>
                  {status === 'live' && <div className="size-1.5 bg-white rounded-full animate-pulse mr-1" />}
                  {statusConfig.label}
                </Badge>
              )}
              {!imageUrl && currentParticipants && (
                <span className="flex items-center gap-1">
                  <Users className="size-3" />
                  {currentParticipants}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="size-3" />
                {timeAgo(event.created_at)}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StreamCardAuthor({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const avatarShape = getAvatarShape(metadata);
  const displayName = getDisplayName(metadata, pubkey);
  const profileUrl = useProfileUrl(pubkey, metadata);

  if (author.isLoading) {
    return <Skeleton className="size-9 rounded-full shrink-0" />;
  }

  return (
    <Link to={profileUrl} className="shrink-0" onClick={(e) => e.stopPropagation()}>
      <Avatar shape={avatarShape} className="size-9">
        <AvatarImage src={metadata?.picture} alt={displayName} />
        <AvatarFallback className="bg-primary/20 text-primary text-xs">
          {displayName[0]?.toUpperCase()}
        </AvatarFallback>
      </Avatar>
    </Link>
  );
}

function StreamCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <Skeleton className="w-full aspect-video rounded-none" />
      <CardContent className="p-3">
        <div className="flex items-start gap-2.5">
          <Skeleton className="size-9 rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
