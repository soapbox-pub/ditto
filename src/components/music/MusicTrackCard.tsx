import { useMemo } from 'react';
import { Play, Pause, Music } from 'lucide-react';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import { useAudioPlayer } from '@/contexts/audioPlayerContextDef';
import { useAuthor } from '@/hooks/useAuthor';
import { parseMusicTrack, toAudioTrack } from '@/lib/musicHelpers';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface MusicTrackCardProps {
  /** The music track event. */
  event: NostrEvent;
}

/**
 * Square card for horizontal scroll sections (Featured, genre-filtered).
 *
 * Layout: [square artwork with hover play overlay] + [title] + [artist]
 *
 * **States**:
 * - Default: Artwork with title and artist below
 * - Hover: Semi-transparent overlay with centered play button
 * - Now playing: Primary ring around artwork, pause icon on overlay
 * - No artwork: Gradient placeholder with Music icon
 */
export function MusicTrackCard({ event }: MusicTrackCardProps) {
  const player = useAudioPlayer();
  const parsed = useMemo(() => parseMusicTrack(event), [event]);
  const author = useAuthor(event.pubkey);

  const naddrPath = useMemo(() => {
    const d = event.tags.find(([n]) => n === 'd')?.[1] ?? '';
    return '/' + nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier: d });
  }, [event]);

  if (!parsed) return null;

  const isNowPlaying = player.currentTrack?.id === event.id;

  const handlePlay = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isNowPlaying && player.isPlaying) {
      player.pause();
    } else if (isNowPlaying) {
      player.resume();
    } else {
      const track = toAudioTrack(event, parsed);
      track.artwork ??= author.data?.metadata?.picture;
      player.playTrack(track);
    }
  };

  return (
    <Link to={naddrPath} className="w-[140px] shrink-0 cursor-pointer group">
      {/* Artwork */}
      <div
        className={cn(
          'w-full aspect-square rounded-xl overflow-hidden relative',
          isNowPlaying && 'ring-2 ring-primary',
        )}
      >
        {parsed.artwork ? (
          <img src={parsed.artwork} alt={parsed.title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/15 via-primary/5 to-transparent flex items-center justify-center">
            <Music className="size-8 text-primary/20" />
          </div>
        )}
        {/* Play overlay on hover */}
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors"
          onClick={handlePlay}
        >
          <div className={cn(
            'size-10 rounded-full flex items-center justify-center transition-all',
            'opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100',
            isNowPlaying && player.isPlaying
              ? 'bg-primary text-primary-foreground opacity-100 scale-100'
              : 'bg-white/90 text-black',
          )}>
            {isNowPlaying && player.isPlaying
              ? <Pause className="size-4" fill="currentColor" />
              : <Play className="size-4 ml-0.5" fill="currentColor" />}
          </div>
        </div>
      </div>

      {/* Info */}
      <p className="text-sm font-medium truncate mt-2">{parsed.title}</p>
      <p className="text-xs text-muted-foreground truncate">{parsed.artist}</p>
    </Link>
  );
}

/** Loading skeleton matching MusicTrackCard dimensions. */
export function MusicTrackCardSkeleton() {
  return (
    <div className="w-[140px] shrink-0">
      <Skeleton className="w-full aspect-square rounded-xl" />
      <Skeleton className="h-4 w-3/4 mt-2" />
      <Skeleton className="h-3 w-1/2 mt-1" />
    </div>
  );
}
