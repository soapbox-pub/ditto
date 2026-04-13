import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Play, Pause, Music, Clock } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';

import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { EmojifiedText } from '@/components/CustomEmoji';
import { useAudioPlayer } from '@/contexts/audioPlayerContextDef';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFollowList } from '@/hooks/useFollowActions';
import { useCuratorFollowList } from '@/hooks/useCuratorFollowList';
import { parseMusicTrack, toAudioTrack } from '@/lib/musicHelpers';
import { genUserName } from '@/lib/genUserName';
import { getAvatarShape } from '@/lib/avatarShape';
import { timeAgo } from '@/lib/timeAgo';
import { formatTime } from '@/lib/formatTime';
import { cn } from '@/lib/utils';

/** Rich music widget showing the latest track with playback controls. */
export function MusicWidget() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { data: followData } = useFollowList();
  const { data: curatorFollows } = useCuratorFollowList();

  const followPubkeys = followData?.pubkeys;
  const authors = user && followPubkeys?.length ? followPubkeys : curatorFollows;
  const authorsKey = user ? 'follows' : 'curator';

  const { data: event, isLoading } = useQuery<NostrEvent | null>({
    queryKey: ['widget-music', authorsKey],
    queryFn: async () => {
      const events = await nostr.query([{ kinds: [36787], limit: 1, ...(authors ? { authors } : {}) }]);
      return events[0] ?? null;
    },
    staleTime: 5 * 60_000,
    enabled: user ? followPubkeys !== undefined : curatorFollows !== undefined,
  });

  if (isLoading) {
    return (
      <div className="space-y-2 p-1">
        <Skeleton className="w-full aspect-square rounded-lg" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <div className="flex items-center gap-2">
          <Skeleton className="size-5 rounded-full" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
    );
  }

  if (!event) {
    return <p className="text-sm text-muted-foreground p-1">No music yet.</p>;
  }

  return <MusicCard event={event} />;
}

function MusicCard({ event }: { event: NostrEvent }) {
  const player = useAudioPlayer();
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const avatarShape = getAvatarShape(metadata);
  const displayName = metadata?.name || genUserName(event.pubkey);

  const parsed = useMemo(() => parseMusicTrack(event), [event]);
  const encodedId = useMemo(() => {
    const d = event.tags.find(([n]) => n === 'd')?.[1] ?? '';
    return nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier: d });
  }, [event]);

  if (!parsed) return null;

  const isNowPlaying = player.currentTrack?.id === event.id;
  const dur = parsed.duration ? formatTime(parsed.duration) : undefined;

  const handlePlay = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isNowPlaying && player.isPlaying) {
      player.pause();
    } else if (isNowPlaying) {
      player.resume();
    } else {
      const track = toAudioTrack(event, parsed);
      track.artwork ??= metadata?.picture;
      player.playTrack(track);
    }
  };

  return (
    <div className="space-y-2">
      {/* Artwork with play overlay */}
      <div
        className={cn(
          'relative rounded-lg overflow-hidden cursor-pointer',
          isNowPlaying ? 'ring-2 ring-primary' : '',
        )}
        onClick={handlePlay}
      >
        {parsed.artwork ? (
          <img
            src={parsed.artwork}
            alt={parsed.title}
            className="w-full aspect-square object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full aspect-square bg-gradient-to-br from-primary/10 via-primary/5 to-transparent flex items-center justify-center">
            <Music className="size-12 text-primary/20" />
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/15 transition-colors">
          <div
            className={cn(
              'size-12 rounded-full flex items-center justify-center transition-colors',
              isNowPlaying && player.isPlaying
                ? 'bg-primary text-primary-foreground'
                : 'bg-primary/15 text-primary hover:bg-primary/25 backdrop-blur-sm',
            )}
          >
            {isNowPlaying && player.isPlaying
              ? <Pause className="size-5" fill="currentColor" />
              : <Play className="size-5 ml-0.5" fill="currentColor" />}
          </div>
        </div>
      </div>

      {/* Track info */}
      <Link to={`/${encodedId}`} className="block px-0.5 space-y-1 group">
        <p className="text-sm font-semibold leading-snug truncate group-hover:text-primary transition-colors">
          {parsed.title}
        </p>
        {parsed.artist && (
          <p className="text-xs text-muted-foreground truncate">{parsed.artist}</p>
        )}
        {dur && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="size-3 shrink-0" />
            <span>{dur}</span>
          </div>
        )}

        {/* Author row */}
        <div className="flex items-center gap-1.5 pt-0.5">
          <Avatar shape={avatarShape} className="size-4">
            <AvatarImage src={metadata?.picture} alt={displayName} />
            <AvatarFallback className="bg-primary/20 text-primary text-[8px]">
              {displayName[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="text-xs font-semibold truncate">
            {author.data?.event ? (
              <EmojifiedText tags={author.data.event.tags}>{displayName}</EmojifiedText>
            ) : displayName}
          </span>
          <span className="text-xs text-muted-foreground shrink-0">&middot; {timeAgo(event.created_at)}</span>
        </div>
      </Link>
    </div>
  );
}
