import { useMemo, useState } from 'react';
import { Play, Pause, Music } from 'lucide-react';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import { useAudioPlayer } from '@/contexts/audioPlayerContextDef';
import { useAuthor } from '@/hooks/useAuthor';
import { parseMusicTrack, toAudioTrack } from '@/lib/musicHelpers';
import { formatTime } from '@/lib/formatTime';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface MusicTrackRowProps {
  /** The music track event. */
  event: NostrEvent;
  /** Optional row index (displayed when not hovering/playing). */
  index?: number;
}

/**
 * Compact track row for "Recently Added" sections and the Tracks tab.
 *
 * Layout: [index/play] [artwork] [title + artist] [duration]
 *
 * **States**:
 * - Default: Shows row index, muted text
 * - Hover: Index replaced with play icon
 * - Now playing: Primary-colored title, pause icon, subtle bg tint
 * - No artwork: Small Music icon placeholder
 */
export function MusicTrackRow({ event, index }: MusicTrackRowProps) {
  const player = useAudioPlayer();
  const parsed = useMemo(() => parseMusicTrack(event), [event]);
  const author = useAuthor(event.pubkey);
  const [imgError, setImgError] = useState(false);

  const naddrPath = useMemo(() => {
    const d = event.tags.find(([n]) => n === 'd')?.[1] ?? '';
    return '/' + nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier: d });
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
      track.artwork ??= author.data?.metadata?.picture;
      player.playTrack(track);
    }
  };

  return (
    <Link
      to={naddrPath}
      className={cn(
        'flex items-center gap-3 px-4 py-2.5 transition-colors cursor-pointer group',
        isNowPlaying ? 'bg-primary/5' : 'hover:bg-secondary/30',
      )}
    >
      {/* Index / Play button */}
      <button
        onClick={handlePlay}
        className="size-8 flex items-center justify-center shrink-0"
        aria-label={isNowPlaying && player.isPlaying ? 'Pause' : 'Play'}
      >
        {isNowPlaying && player.isPlaying ? (
          <Pause className="size-4 text-primary" fill="currentColor" />
        ) : (
          <>
            <span className="text-sm text-muted-foreground group-hover:hidden tabular-nums">
              {index !== undefined ? index + 1 : ''}
            </span>
            <Play className="size-4 text-muted-foreground hidden group-hover:block" fill="currentColor" />
          </>
        )}
      </button>

      {/* Artwork */}
      <div className="size-12 rounded-lg overflow-hidden shrink-0 bg-muted">
        {parsed.artwork && !imgError ? (
          <img src={parsed.artwork} alt={parsed.title} className="size-full object-cover" loading="lazy" onError={() => setImgError(true)} />
        ) : (
          <div className="size-full flex items-center justify-center bg-primary/10">
            <Music className="size-5 text-primary/30" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className={cn(
          'text-sm font-medium truncate',
          isNowPlaying && 'text-primary',
        )}>
          {parsed.title}
        </p>
        <p className="text-xs text-muted-foreground truncate">{parsed.artist}</p>
      </div>

      {/* Duration */}
      {dur && (
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">{dur}</span>
      )}
    </Link>
  );
}

/** Loading skeleton matching MusicTrackRow dimensions. */
export function MusicTrackRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <Skeleton className="size-8 rounded" />
      <Skeleton className="size-12 rounded-lg" />
      <div className="flex-1 min-w-0 space-y-1">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="h-3 w-8" />
    </div>
  );
}
