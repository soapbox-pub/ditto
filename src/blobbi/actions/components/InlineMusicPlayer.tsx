// src/blobbi/actions/components/InlineMusicPlayer.tsx

import { useCallback, useEffect } from 'react';
import { Music, Play, Pause, Square, MoreHorizontal, Loader2, AlertCircle, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { useAudioPlayback } from '../hooks/useAudioPlayback';
import type { AudioSource } from './PlayMusicModal';

// Re-export for external use
export type { AudioSource as MusicTrackSource } from './PlayMusicModal';

interface InlineMusicPlayerProps {
  /** The selected track source */
  source: AudioSource;
  /** Called when user wants to change the track */
  onChangeTrack: () => void;
  /** Called when user closes the player */
  onClose: () => void;
  /** Called when playback starts (for Blobbi reaction state) */
  onPlaybackStart?: () => void;
  /** Called when playback stops/pauses (for Blobbi reaction state) */
  onPlaybackStop?: () => void;
  /** Whether the action has been published (playback only starts after publish) */
  isPublished: boolean;
  /** Whether publishing is in progress */
  isPublishing: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function InlineMusicPlayer({
  source,
  onChangeTrack,
  onClose,
  onPlaybackStart,
  onPlaybackStop,
  isPublished,
  isPublishing,
}: InlineMusicPlayerProps) {
  const {
    state: playbackState,
    error: playbackError,
    load,
    toggle,
    stop,
    isPlaying,
    cleanup,
  } = useAudioPlayback({
    onEnded: () => {
      onPlaybackStop?.();
    },
  });
  
  // Auto-start playback when published
  useEffect(() => {
    if (isPublished && playbackState === 'idle') {
      load(source.url, true);
      onPlaybackStart?.();
    }
  }, [isPublished, playbackState, source.url, load, onPlaybackStart]);
  
  // Notify on playback state changes
  useEffect(() => {
    if (isPlaying) {
      onPlaybackStart?.();
    } else if (playbackState === 'paused') {
      onPlaybackStop?.();
    }
  }, [isPlaying, playbackState, onPlaybackStart, onPlaybackStop]);
  
  // Cleanup on close
  const handleClose = useCallback(() => {
    stop();
    cleanup();
    onPlaybackStop?.();
    onClose();
  }, [stop, cleanup, onPlaybackStop, onClose]);
  
  // Handle play/pause toggle
  const handleToggle = useCallback(async () => {
    if (playbackState === 'idle') {
      load(source.url, true);
    } else {
      await toggle();
    }
  }, [playbackState, source.url, load, toggle]);
  
  // Track title
  const trackTitle = source.type === 'builtin' 
    ? source.track?.title ?? 'Unknown Track'
    : source.file?.name ?? 'Uploaded Track';
  
  const trackArtist = source.type === 'builtin'
    ? source.track?.artist
    : undefined;
  
  const isLoading = playbackState === 'loading' || isPublishing;
  const hasError = playbackState === 'error';
  
  return (
    <div className="mx-4 sm:mx-6 mb-4">
      <div className={cn(
        "rounded-xl border bg-card/80 backdrop-blur-sm overflow-hidden",
        "shadow-sm transition-all",
        isPlaying && "ring-2 ring-pink-500/30"
      )}>
        {/* Main content row */}
        <div className="flex items-center gap-3 p-3">
          {/* Music icon / Now Playing indicator */}
          <div className={cn(
            "size-10 rounded-lg flex items-center justify-center shrink-0",
            isPlaying 
              ? "bg-pink-500/20" 
              : "bg-muted"
          )}>
            <Music className={cn(
              "size-5",
              isPlaying ? "text-pink-500 animate-pulse" : "text-muted-foreground"
            )} />
          </div>
          
          {/* Track info */}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{trackTitle}</p>
            {trackArtist && (
              <p className="text-xs text-muted-foreground truncate">{trackArtist}</p>
            )}
            {!trackArtist && (
              <p className="text-xs text-muted-foreground">
                {isPlaying ? 'Now playing...' : isPublishing ? 'Starting...' : 'Ready to play'}
              </p>
            )}
          </div>
          
          {/* Controls */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Play/Pause button */}
            <Button
              size="icon"
              variant="ghost"
              onClick={handleToggle}
              disabled={isLoading || !isPublished}
              className="size-9 rounded-full"
            >
              {isLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : isPlaying ? (
                <Pause className="size-4" />
              ) : (
                <Play className="size-4 ml-0.5" />
              )}
            </Button>
            
            {/* Stop button */}
            {isPublished && (playbackState === 'playing' || playbackState === 'paused') && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => { stop(); onPlaybackStop?.(); }}
                className="size-9 rounded-full"
              >
                <Square className="size-3.5" />
              </Button>
            )}
            
            {/* Change track button */}
            <Button
              size="icon"
              variant="ghost"
              onClick={onChangeTrack}
              disabled={isPublishing}
              className="size-9 rounded-full"
            >
              <MoreHorizontal className="size-4" />
            </Button>
            
            {/* Close button */}
            <Button
              size="icon"
              variant="ghost"
              onClick={handleClose}
              disabled={isPublishing}
              className="size-9 rounded-full text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
        
        {/* Error message */}
        {hasError && playbackError && (
          <div className="px-3 pb-3">
            <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <AlertCircle className="size-4 mt-0.5 shrink-0" />
              <p className="text-xs">{playbackError.message}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
