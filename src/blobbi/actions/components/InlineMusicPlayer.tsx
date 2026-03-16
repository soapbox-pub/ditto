// src/blobbi/actions/components/InlineMusicPlayer.tsx

import { useState, useCallback, useEffect } from 'react';
import { Music, Play, Pause, RotateCcw, MoreHorizontal, Loader2, AlertCircle, X, Volume2, VolumeX } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
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
    restart,
    stop,
    isPlaying,
    volume,
    setVolume,
    cleanup,
  } = useAudioPlayback({
    onEnded: () => {
      onPlaybackStop?.();
    },
  });
  
  // Volume slider visibility
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  
  // Close volume slider when clicking outside
  useEffect(() => {
    if (!showVolumeSlider) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Check if click is outside the volume control area
      if (!target.closest('[data-volume-control]')) {
        setShowVolumeSlider(false);
      }
    };
    
    // Delay adding listener to avoid immediate close from the opening click
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 0);
    
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showVolumeSlider]);
  
  // Auto-start playback when first published (idle -> playing)
  // Note: 'stopped' state is NOT included here - stop is a terminal state
  // that requires explicit user action (play button) to restart
  useEffect(() => {
    if (isPublished && playbackState === 'idle') {
      load(source.url, true);
      onPlaybackStart?.();
    }
  }, [isPublished, playbackState, source.url, load, onPlaybackStart]);
  
  // Force reload when source URL changes while already playing/paused
  useEffect(() => {
    // Only trigger reload if we're in an active playback state with a different URL
    if (isPublished && (playbackState === 'playing' || playbackState === 'paused')) {
      // The load function will check if URL changed and reload if needed
      load(source.url, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Only react to source.url changes
  }, [source.url]);
  
  // Notify on playback state changes
  useEffect(() => {
    if (isPlaying) {
      onPlaybackStart?.();
    } else if (playbackState === 'paused' || playbackState === 'stopped') {
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
    if (playbackState === 'idle' || playbackState === 'stopped') {
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
            
            {/* Restart button - only show when actively playing or paused */}
            {isPublished && (playbackState === 'playing' || playbackState === 'paused') && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  restart();
                }}
                className="size-9 rounded-full"
                title="Restart from beginning"
              >
                <RotateCcw className="size-3.5" />
              </Button>
            )}
            
            {/* Volume control */}
            <div className="relative flex items-center" data-volume-control>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setShowVolumeSlider(!showVolumeSlider)}
                className="size-9 rounded-full"
                title={volume === 0 ? 'Unmute' : 'Volume'}
              >
                {volume === 0 ? (
                  <VolumeX className="size-4" />
                ) : (
                  <Volume2 className="size-4" />
                )}
              </Button>
              
              {/* Volume slider popup */}
              {showVolumeSlider && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 p-3 bg-popover border rounded-lg shadow-lg z-10 min-w-[120px]">
                  <Slider
                    value={[volume * 100]}
                    onValueChange={([val]) => setVolume(val / 100)}
                    max={100}
                    step={1}
                    className="w-full"
                  />
                </div>
              )}
            </div>
            
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
