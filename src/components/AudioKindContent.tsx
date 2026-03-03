/**
 * Inline audio content cards for NoteCard rendering.
 * Renders music tracks, playlists, podcast episodes, and trailers
 * with play buttons that trigger the global audio player.
 */

import { useMemo } from 'react';
import { Play, Pause, Music, ListMusic, Podcast, Clock } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useAudioPlayer } from '@/contexts/AudioPlayerContext';
import { parseMusicTrack, parseMusicPlaylist, toAudioTrack } from '@/lib/musicHelpers';
import { parsePodcastEpisode, parsePodcastTrailer, episodeToAudioTrack, trailerToAudioTrack } from '@/lib/podcastHelpers';
import { useAuthor } from '@/hooks/useAuthor';
import { getDisplayName } from '@/lib/getDisplayName';
import { formatTime } from '@/lib/formatTime';
import { cn } from '@/lib/utils';

/** Shared play/pause button used across all audio cards. */
function PlayButton({ isPlaying, isActive, onClick, size = 'lg' }: {
  isPlaying: boolean;
  isActive: boolean;
  onClick: (e: React.MouseEvent) => void;
  size?: 'sm' | 'lg';
}) {
  const sizeCls = size === 'lg' ? 'size-12' : 'size-10';
  const iconCls = size === 'lg' ? 'size-5' : 'size-4';

  return (
    <button
      onClick={onClick}
      className={cn(
        'shrink-0 rounded-full flex items-center justify-center transition-colors',
        sizeCls,
        isActive && isPlaying
          ? 'bg-primary text-primary-foreground'
          : 'bg-primary/15 text-primary hover:bg-primary/25',
      )}
      aria-label={isActive && isPlaying ? 'Pause' : 'Play'}
    >
      {isActive && isPlaying
        ? <Pause className={iconCls} fill="currentColor" />
        : <Play className={cn(iconCls, 'ml-0.5')} fill="currentColor" />}
    </button>
  );
}

// ── Music Track (kind 36787) ─────────────────────────────────────────────────

export function MusicTrackContent({ event }: { event: NostrEvent }) {
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
        'mt-3 rounded-2xl border overflow-hidden',
        isNowPlaying ? 'border-primary bg-primary/5' : 'border-border',
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Cover artwork */}
      {parsed.artwork ? (
        <div className="relative aspect-square max-h-[280px] w-full overflow-hidden">
          <img src={parsed.artwork} alt={parsed.title} className="w-full h-full object-cover" loading="lazy" />
          {/* Play overlay centered on artwork */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/10 transition-colors">
            <PlayButton isPlaying={player.isPlaying} isActive={isNowPlaying} onClick={handlePlay} size="lg" />
          </div>
        </div>
      ) : (
        <div className="relative flex items-center justify-center bg-gradient-to-br from-primary/10 via-primary/5 to-transparent h-[140px]">
          <Music className="size-10 text-primary/20" />
          <div className="absolute inset-0 flex items-center justify-center">
            <PlayButton isPlaying={player.isPlaying} isActive={isNowPlaying} onClick={handlePlay} size="lg" />
          </div>
        </div>
      )}

      {/* Track info */}
      <div className="p-3.5 space-y-1.5">
        <p className="text-[15px] font-semibold leading-snug truncate">{parsed.title}</p>
        {parsed.artist && <p className="text-sm text-muted-foreground truncate">{parsed.artist}</p>}
        {dur && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3 shrink-0" />
            <span>{dur}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Music Playlist (kind 34139) ──────────────────────────────────────────────

export function MusicPlaylistContent({ event }: { event: NostrEvent }) {
  const parsed = useMemo(() => parseMusicPlaylist(event), [event]);

  if (!parsed) return null;

  const trackCount = parsed.trackRefs.length;

  return (
    <div
      className="mt-3 rounded-2xl border border-border overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Cover artwork */}
      {parsed.artwork ? (
        <div className="aspect-video max-h-[200px] w-full overflow-hidden">
          <img src={parsed.artwork} alt={parsed.title} className="w-full h-full object-cover" loading="lazy" />
        </div>
      ) : (
        <div className="flex items-center justify-center bg-gradient-to-br from-primary/10 via-primary/5 to-transparent h-[100px]">
          <ListMusic className="size-10 text-primary/20" />
        </div>
      )}

      {/* Playlist info */}
      <div className="p-3.5 space-y-1.5">
        <p className="text-[15px] font-semibold leading-snug truncate">{parsed.title}</p>
        {parsed.description && <p className="text-sm text-muted-foreground line-clamp-2">{parsed.description}</p>}
        {trackCount > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ListMusic className="size-3 shrink-0" />
            <span>{trackCount} track{trackCount !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Podcast Episode (kind 30054) ─────────────────────────────────────────────

export function PodcastEpisodeContent({ event }: { event: NostrEvent }) {
  const player = useAudioPlayer();
  const parsed = useMemo(() => parsePodcastEpisode(event), [event]);
  const author = useAuthor(event.pubkey);
  const displayName = getDisplayName(author.data?.metadata, event.pubkey);

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
      const track = episodeToAudioTrack(event, parsed);
      track.artist = displayName;
      track.artwork ??= author.data?.metadata?.picture;
      player.playTrack(track);
    }
  };

  return (
    <div
      className={cn(
        'mt-3 rounded-2xl border overflow-hidden',
        isNowPlaying ? 'border-primary bg-primary/5' : 'border-border',
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Cover artwork */}
      {parsed.artwork ? (
        <div className="relative aspect-square max-h-[280px] w-full overflow-hidden">
          <img src={parsed.artwork} alt={parsed.title} className="w-full h-full object-cover" loading="lazy" />
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/10 transition-colors">
            <PlayButton isPlaying={player.isPlaying} isActive={isNowPlaying} onClick={handlePlay} size="lg" />
          </div>
        </div>
      ) : (
        <div className="relative flex items-center justify-center bg-gradient-to-br from-primary/10 via-primary/5 to-transparent h-[140px]">
          <Podcast className="size-10 text-primary/20" />
          <div className="absolute inset-0 flex items-center justify-center">
            <PlayButton isPlaying={player.isPlaying} isActive={isNowPlaying} onClick={handlePlay} size="lg" />
          </div>
        </div>
      )}

      {/* Episode info */}
      <div className="p-3.5 space-y-1.5">
        <p className="text-[15px] font-semibold leading-snug line-clamp-2">{parsed.title}</p>
        {parsed.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{parsed.description}</p>
        )}
        {dur && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3 shrink-0" />
            <span>{dur}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Podcast Trailer (kind 30055) ─────────────────────────────────────────────

export function PodcastTrailerContent({ event }: { event: NostrEvent }) {
  const player = useAudioPlayer();
  const parsed = useMemo(() => parsePodcastTrailer(event), [event]);
  const author = useAuthor(event.pubkey);
  const displayName = getDisplayName(author.data?.metadata, event.pubkey);

  if (!parsed) return null;

  const isNowPlaying = player.currentTrack?.id === event.id;

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isNowPlaying && player.isPlaying) {
      player.pause();
    } else if (isNowPlaying) {
      player.resume();
    } else {
      const track = trailerToAudioTrack(event, parsed);
      track.artist = displayName;
      track.artwork ??= author.data?.metadata?.picture;
      player.playTrack(track);
    }
  };

  return (
    <div
      className={cn(
        'mt-3 rounded-2xl border overflow-hidden',
        isNowPlaying ? 'border-primary bg-primary/5' : 'border-border',
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Compact header with icon */}
      <div className="flex items-center justify-center bg-gradient-to-br from-primary/10 via-primary/5 to-transparent h-[100px] relative">
        <Podcast className="size-8 text-primary/20" />
        <div className="absolute inset-0 flex items-center justify-center">
          <PlayButton isPlaying={player.isPlaying} isActive={isNowPlaying} onClick={handlePlay} size="lg" />
        </div>
      </div>

      {/* Trailer info */}
      <div className="p-3.5 space-y-1">
        <p className="text-[15px] font-semibold leading-snug truncate">{parsed.title}</p>
        <p className="text-xs text-muted-foreground">Trailer</p>
      </div>
    </div>
  );
}
