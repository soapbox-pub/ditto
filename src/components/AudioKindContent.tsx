/**
 * Inline audio content cards for NoteCard rendering.
 * Renders music tracks, playlists, podcast episodes, and trailers
 * with play buttons that trigger the global audio player.
 */

import { useMemo } from 'react';
import { Play, Pause, Music, ListMusic, Podcast } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useAudioPlayer } from '@/contexts/AudioPlayerContext';
import { parseMusicTrack, parseMusicPlaylist, toAudioTrack } from '@/lib/musicHelpers';
import { parsePodcastEpisode, parsePodcastTrailer, episodeToAudioTrack, trailerToAudioTrack } from '@/lib/podcastHelpers';
import { useAuthor } from '@/hooks/useAuthor';
import { getDisplayName } from '@/lib/getDisplayName';
import { formatTime } from '@/lib/formatTime';
import { cn } from '@/lib/utils';

// ── Music Track (kind 36787) ─────────────────────────────────────────────────

export function MusicTrackContent({ event }: { event: NostrEvent }) {
  const player = useAudioPlayer();
  const parsed = useMemo(() => parseMusicTrack(event), [event]);

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
      player.playTrack(toAudioTrack(event, parsed));
    }
  };

  return (
    <div
      className={cn(
        'mt-3 rounded-2xl border p-3 flex items-center gap-3',
        isNowPlaying ? 'border-primary bg-primary/5' : 'border-border bg-muted/30',
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Artwork */}
      <div className="shrink-0 size-14 rounded-xl overflow-hidden bg-muted relative">
        {parsed.artwork ? (
          <img src={parsed.artwork} alt={parsed.title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-primary/10">
            <Music className="size-5 text-primary/40" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="text-sm font-semibold truncate">{parsed.title}</p>
        {parsed.artist && <p className="text-xs text-muted-foreground truncate">{parsed.artist}</p>}
        {dur && <p className="text-xs text-muted-foreground">{dur}</p>}
      </div>

      {/* Play button */}
      <button
        onClick={handlePlay}
        className={cn(
          'shrink-0 size-10 rounded-full flex items-center justify-center transition-colors',
          isNowPlaying && player.isPlaying
            ? 'bg-primary text-primary-foreground'
            : 'bg-primary/15 text-primary hover:bg-primary/25',
        )}
        aria-label={isNowPlaying && player.isPlaying ? 'Pause' : 'Play'}
      >
        {isNowPlaying && player.isPlaying
          ? <Pause className="size-4" fill="currentColor" />
          : <Play className="size-4 ml-0.5" fill="currentColor" />}
      </button>
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
      className="mt-3 rounded-2xl border border-border bg-muted/30 p-3 flex items-center gap-3"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Artwork */}
      <div className="shrink-0 size-14 rounded-xl overflow-hidden bg-muted">
        {parsed.artwork ? (
          <img src={parsed.artwork} alt={parsed.title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-primary/10">
            <ListMusic className="size-5 text-primary/40" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="text-sm font-semibold truncate">{parsed.title}</p>
        {parsed.description && <p className="text-xs text-muted-foreground line-clamp-1">{parsed.description}</p>}
        {trackCount > 0 && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <ListMusic className="size-3" />{trackCount} track{trackCount !== 1 ? 's' : ''}
          </p>
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
      player.playTrack(track);
    }
  };

  return (
    <div
      className={cn(
        'mt-3 rounded-2xl border p-3 flex items-center gap-3',
        isNowPlaying ? 'border-primary bg-primary/5' : 'border-border bg-muted/30',
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Artwork */}
      <div className="shrink-0 size-14 rounded-xl overflow-hidden bg-muted relative">
        {parsed.artwork ? (
          <img src={parsed.artwork} alt={parsed.title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-primary/10">
            <Podcast className="size-5 text-primary/40" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="text-sm font-semibold truncate">{parsed.title}</p>
        {parsed.description && <p className="text-xs text-muted-foreground line-clamp-2">{parsed.description}</p>}
        {dur && <p className="text-xs text-muted-foreground">{dur}</p>}
      </div>

      {/* Play button */}
      <button
        onClick={handlePlay}
        className={cn(
          'shrink-0 size-10 rounded-full flex items-center justify-center transition-colors',
          isNowPlaying && player.isPlaying
            ? 'bg-primary text-primary-foreground'
            : 'bg-primary/15 text-primary hover:bg-primary/25',
        )}
        aria-label={isNowPlaying && player.isPlaying ? 'Pause' : 'Play'}
      >
        {isNowPlaying && player.isPlaying
          ? <Pause className="size-4" fill="currentColor" />
          : <Play className="size-4 ml-0.5" fill="currentColor" />}
      </button>
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
      player.playTrack(track);
    }
  };

  return (
    <div
      className={cn(
        'mt-3 rounded-2xl border p-3 flex items-center gap-3',
        isNowPlaying ? 'border-primary bg-primary/5' : 'border-border bg-muted/30',
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="shrink-0 size-10 rounded-lg bg-primary/10 flex items-center justify-center">
        <Podcast className="size-4 text-primary/40" />
      </div>

      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="text-sm font-semibold truncate">{parsed.title}</p>
        <p className="text-xs text-muted-foreground">Trailer</p>
      </div>

      <button
        onClick={handlePlay}
        className={cn(
          'shrink-0 size-10 rounded-full flex items-center justify-center transition-colors',
          isNowPlaying && player.isPlaying
            ? 'bg-primary text-primary-foreground'
            : 'bg-primary/15 text-primary hover:bg-primary/25',
        )}
        aria-label={isNowPlaying && player.isPlaying ? 'Pause' : 'Play'}
      >
        {isNowPlaying && player.isPlaying
          ? <Pause className="size-4" fill="currentColor" />
          : <Play className="size-4 ml-0.5" fill="currentColor" />}
      </button>
    </div>
  );
}
