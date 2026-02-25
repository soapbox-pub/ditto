import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Mic, Users, Clock, Plus } from 'lucide-react';
import { useSeoMeta } from '@unhead/react';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { useAuthor } from '@/hooks/useAuthor';
import { useStreamKind } from '@/hooks/useStreamKind';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNestPresenceCount } from '@/hooks/useNestPresence';
import { getDisplayName } from '@/lib/getDisplayName';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { timeAgo } from '@/lib/timeAgo';
import { cn } from '@/lib/utils';
import { CreateNestDialog } from '@/components/CreateNestDialog';
import { useState } from 'react';

/** Nest room kind (NIP-53 variant). */
const NEST_KIND = 30312;

/** Gradient CSS values for nest card backgrounds. */
const NEST_GRADIENTS: Record<string, string> = {
  'gradient-1': 'linear-gradient(90deg, #16a085 0%, #f4d03f 100%)',
  'gradient-2': 'linear-gradient(90deg, #e65c00 0%, #f9d423 100%)',
  'gradient-3': 'linear-gradient(90deg, #3a1c71 0%, #d76d77 50%, #ffaf7b 100%)',
  'gradient-4': 'linear-gradient(90deg, #8584b4 0%, #6969aa 50%, #62629b 100%)',
  'gradient-5': 'linear-gradient(90deg, #00c6fb 0%, #005bea 100%)',
  'gradient-6': 'linear-gradient(90deg, #d558c8 0%, #24d292 100%)',
  'gradient-7': 'linear-gradient(90deg, #d31027 0%, #ea384d 100%)',
  'gradient-8': 'linear-gradient(90deg, #ff512f 0%, #dd2476 100%)',
  'gradient-9': 'linear-gradient(90deg, #6a3093 0%, #a044ff 100%)',
  'gradient-10': 'linear-gradient(90deg, #00b09b 0%, #96c93d 100%)',
  'gradient-11': 'linear-gradient(90deg, #f78ca0 0%, #f9748f 19%, #fd868c 60%)',
};

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

/**
 * Validate a nest event has the required infrastructure tags.
 * Mirrors the nests app: must have a LiveKit streaming URL and a service URL.
 */
function isValidNest(event: NostrEvent): boolean {
  const title = getTag(event.tags, 'title');
  const dTag = getTag(event.tags, 'd');
  if (!title || !dTag) return false;

  const hasLivekit = event.tags.some(
    ([name, value]) =>
      name === 'streaming' &&
      (value?.startsWith('wss+livekit://') || value?.startsWith('ws+livekit://')),
  );
  const hasService = event.tags.some(
    ([name, value]) => name === 'service' && value?.startsWith('http'),
  );

  return hasLivekit && hasService;
}

/**
 * Filter rooms by status to only show relevant ones:
 * - "live" rooms are shown (presence filtering happens at card level)
 * - "planned" rooms are shown only if their start time is less than 1 hour past
 * - "ended" rooms are excluded entirely
 * - Unknown status is excluded
 */
function isRelevantNest(event: NostrEvent): boolean {
  const status = getTag(event.tags, 'status');

  if (status === 'live') return true;

  if (status === 'planned') {
    const starts = Number(getTag(event.tags, 'starts'));
    if (!starts) return true; // No start time = show it
    const now = Math.floor(Date.now() / 1000);
    // Hide planned rooms whose start time is more than 1 hour past
    return starts + 3600 > now;
  }

  // Hide ended rooms and unknown statuses
  return false;
}

export function NestsFeedPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const { user } = useCurrentUser();

  useSeoMeta({
    title: 'Nests | Ditto',
    description: 'Live audio rooms on Nostr',
  });

  const { events, isLoading } = useStreamKind(NEST_KIND);

  // Filter to valid + relevant rooms, then sort: live first, then planned.
  const sorted = useMemo(() => {
    const valid = events.filter((e) => isValidNest(e) && isRelevantNest(e));
    const statusOrder: Record<string, number> = { live: 0, planned: 1 };
    return [...valid].sort((a, b) => {
      const aStatus = getTag(a.tags, 'status') || 'live';
      const bStatus = getTag(b.tags, 'status') || 'live';
      const orderDiff = (statusOrder[aStatus] ?? 2) - (statusOrder[bStatus] ?? 2);
      if (orderDiff !== 0) return orderDiff;
      // Within planned: sort by start time ascending (soonest first)
      if (aStatus === 'planned' && bStatus === 'planned') {
        const aStarts = Number(getTag(a.tags, 'starts')) || 0;
        const bStarts = Number(getTag(b.tags, 'starts')) || 0;
        return aStarts - bStarts;
      }
      // Within live: newest first
      return b.created_at - a.created_at;
    });
  }, [events]);

  return (
    <main className="flex-1 min-w-0 sidebar:max-w-[600px] sidebar:border-l xl:border-r border-border min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 mt-4 mb-5">
        <Link to="/" className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors sidebar:hidden">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="flex items-center gap-2 flex-1">
          <Mic className="size-5" />
          <h1 className="text-xl font-bold">Nests</h1>
        </div>
        {user && (
          <Button
            size="sm"
            className="rounded-full gap-1.5"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="size-4" />
            <span className="hidden sm:inline">Create a Nest</span>
          </Button>
        )}
      </div>

      {/* Feed */}
      {isLoading && events.length === 0 ? (
        <div className="space-y-3 px-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <NestCardSkeleton key={i} />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="px-4">
          <Card className="border-dashed">
            <CardContent className="py-12 px-8 text-center">
              <div className="max-w-sm mx-auto space-y-4">
                <Mic className="size-8 text-muted-foreground/40 mx-auto" />
                <p className="text-muted-foreground">
                  No active nests found. Start a conversation by creating a new nest.
                </p>
                {user && (
                  <Button
                    variant="outline"
                    className="rounded-full"
                    onClick={() => setCreateOpen(true)}
                  >
                    <Plus className="size-4 mr-2" />
                    Create a Nest
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-3 px-4 pb-8">
          {sorted.map((event) => (
            <NestCard key={event.id} event={event} />
          ))}
        </div>
      )}

      {/* Create nest dialog */}
      <CreateNestDialog open={createOpen} onOpenChange={setCreateOpen} />
    </main>
  );
}

function NestCard({ event }: { event: NostrEvent }) {
  const navigate = useNavigate();
  const title = getTag(event.tags, 'title') || 'Untitled Nest';
  const summary = getTag(event.tags, 'summary');
  const imageUrl = getTag(event.tags, 'image');
  const color = getTag(event.tags, 'color');
  const status = getTag(event.tags, 'status');
  const starts = getTag(event.tags, 'starts');
  const statusConfig = getStatusConfig(status);

  // Build a-tag for presence queries
  const dTag = getTag(event.tags, 'd') || '';
  const aTag = `${NEST_KIND}:${event.pubkey}:${dTag}`;
  const { count: listenerCount, pubkeys: presencePubkeys } = useNestPresenceCount(aTag);

  const naddrId = useMemo(() => {
    return nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier: dTag });
  }, [event, dTag]);

  // Background style: image > gradient > default
  const backgroundStyle = useMemo(() => {
    if (imageUrl) {
      return {
        backgroundImage: `url(${imageUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      };
    }
    if (color && NEST_GRADIENTS[color]) {
      return { backgroundImage: NEST_GRADIENTS[color] };
    }
    // Default gradient
    return { backgroundImage: NEST_GRADIENTS['gradient-5'] };
  }, [imageUrl, color]);

  return (
    <Card
      className="overflow-hidden cursor-pointer hover:shadow-lg transition-all group"
      onClick={() => navigate(`/${naddrId}`)}
    >
      {/* Gradient/image header */}
      <div
        className="relative px-4 pt-4 pb-6 text-white"
        style={backgroundStyle}
      >
        {/* Overlay for readability */}
        <div className="absolute inset-0 bg-black/30" />

        <div className="relative z-10 space-y-3">
          {/* Top row: status + listeners */}
          <div className="flex items-center justify-between">
            <Badge variant="outline" className={cn('text-[10px] border-white/30', statusConfig.className)}>
              {status === 'live' && <div className="size-1.5 bg-white rounded-full animate-pulse mr-1" />}
              {statusConfig.label}
            </Badge>
            {(listenerCount > 0 || status === 'live') && (
              <span className="flex items-center gap-1 text-xs text-white/90">
                <Users className="size-3" />
                {listenerCount}
              </span>
            )}
          </div>

          {/* Title */}
          <h3 className="font-bold text-lg leading-snug line-clamp-2">{title}</h3>

          {/* Avatar stack of listeners */}
          {presencePubkeys.length > 0 && (
            <div className="flex items-center -space-x-2">
              {presencePubkeys.slice(0, 5).map((pk) => (
                <PresenceAvatar key={pk} pubkey={pk} />
              ))}
              {presencePubkeys.length > 5 && (
                <span className="text-xs text-white/80 ml-2">
                  +{presencePubkeys.length - 5}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom info */}
      <CardContent className="p-3 space-y-1.5">
        <NestCardAuthor pubkey={event.pubkey} />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {summary && (
            <p className="line-clamp-1 flex-1 min-w-0">{summary}</p>
          )}
          <span className="flex items-center gap-1 shrink-0">
            <Clock className="size-3" />
            {starts && status === 'planned'
              ? new Date(parseInt(starts) * 1000).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })
              : timeAgo(event.created_at)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function PresenceAvatar({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;

  return (
    <Avatar className="size-6 border-2 border-background">
      <AvatarImage src={metadata?.picture} />
      <AvatarFallback className="bg-primary/30 text-[8px] text-white">
        {(metadata?.name?.[0] || '?').toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

function NestCardAuthor({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = getDisplayName(metadata, pubkey);
  const profileUrl = useProfileUrl(pubkey, metadata);

  if (author.isLoading) {
    return <Skeleton className="h-5 w-32" />;
  }

  return (
    <div className="flex items-center gap-2">
      <Link to={profileUrl} className="shrink-0" onClick={(e) => e.stopPropagation()}>
        <Avatar className="size-6">
          <AvatarImage src={metadata?.picture} alt={displayName} />
          <AvatarFallback className="bg-primary/20 text-primary text-[10px]">
            {displayName[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </Link>
      <Link
        to={profileUrl}
        className="text-sm font-medium hover:underline truncate"
        onClick={(e) => e.stopPropagation()}
      >
        {displayName}
      </Link>
      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">Host</Badge>
    </div>
  );
}

function NestCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <Skeleton className="w-full h-36 rounded-none" />
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="size-6 rounded-full" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-3 w-3/4" />
      </CardContent>
    </Card>
  );
}
