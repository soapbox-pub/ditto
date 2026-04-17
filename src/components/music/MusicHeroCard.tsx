import { useMemo } from 'react';
import { Play, Pause, Music } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useAudioPlayer } from '@/contexts/audioPlayerContextDef';
import { useAuthor } from '@/hooks/useAuthor';
import { parseMusicTrack, toAudioTrack } from '@/lib/musicHelpers';
import { formatTime } from '@/lib/formatTime';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface MusicHeroCardProps {
  /** The featured track event. */
  event: NostrEvent;
}

/**
 * Full-width featured track hero card with large artwork and gradient overlay.
 *
 * Displays the featured track with a prominent play button, title, artist,
 * and "Featured" badge. The entire card is playable.
 *
 * **States**:
 * - Default: Gradient overlay with track info
 * - Now playing: Primary border, pause icon on play button
 * - No artwork: Gradient placeholder with Music icon
 */
export function MusicHeroCard({ event }: MusicHeroCardProps) {
  const player = useAudioPlayer();
  const parsed = useMemo(() => parseMusicTrack(event), [event]);
  const author = useAuthor(event.pubkey);

  if (!parsed) return null;

  const isNowPlaying = player.currentTrack?.id === event.id;
  const dur = parsed.duration ? formatTime(parsed.duration) : undefined;

  const handlePlay = (e: React.MouseEvent) => {
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
    <div
      className={cn(
        'mx-4 rounded-2xl overflow-hidden relative cursor-pointer',
        isNowPlaying && 'ring-2 ring-primary',
      )}
      onClick={handlePlay}
    >
      {/* Artwork */}
      {parsed.artwork ? (
        <img
          src={parsed.artwork}
          alt={parsed.title}
          className="w-full aspect-[16/10] object-cover"
          loading="eager"
        />
      ) : (
        <div className="w-full aspect-[16/10] bg-gradient-to-br from-primary/20 via-primary/10 to-accent/10 flex items-center justify-center">
          <Music className="size-16 text-primary/20" />
        </div>
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-5">
        <span className="inline-block px-2.5 py-0.5 rounded-full bg-primary/80 text-primary-foreground text-xs font-medium mb-2">
          Featured
        </span>
        <h3 className="text-2xl font-bold text-white leading-tight truncate">{parsed.title}</h3>
        {parsed.artist && (
          <p className="text-base text-white/80 truncate mt-0.5">{parsed.artist}</p>
        )}
        <div className="flex items-center gap-3 mt-3">
          <button
            onClick={handlePlay}
            className={cn(
              'size-12 rounded-full flex items-center justify-center transition-all hover:scale-105',
              isNowPlaying && player.isPlaying
                ? 'bg-primary text-primary-foreground'
                : 'bg-white/90 text-black hover:bg-white',
            )}
            aria-label={isNowPlaying && player.isPlaying ? 'Pause' : 'Play'}
          >
            {isNowPlaying && player.isPlaying
              ? <Pause className="size-5" fill="currentColor" />
              : <Play className="size-5 ml-0.5" fill="currentColor" />}
          </button>
          {dur && (
            <span className="text-sm text-white/60">{dur}</span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Loading skeleton matching MusicHeroCard dimensions. */
export function MusicHeroCardSkeleton() {
  return (
    <div className="mx-4 rounded-2xl overflow-hidden">
      <Skeleton className="w-full aspect-[16/10]" />
    </div>
  );
}
