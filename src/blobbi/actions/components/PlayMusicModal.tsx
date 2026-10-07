// src/blobbi/actions/components/PlayMusicModal.tsx

import { useState, useRef, useCallback, useEffect } from 'react';
import { Music, Play, Pause, Check, Loader2, Volume2, AlertCircle } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import {
  getAllTracks,
  formatTrackDuration,
  type BlobbiTrack,
} from '../lib/blobbi-track-catalog';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Selected track for the music player
 */
export interface SelectedTrack {
  track: BlobbiTrack;
  url: string;
}

interface PlayMusicModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the selected track when user confirms */
  onConfirm: (selection: SelectedTrack) => void;
  isLoading: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PlayMusicModal({
  open,
  onOpenChange,
  onConfirm,
  isLoading,
}: PlayMusicModalProps) {
  const [selectedTrack, setSelectedTrack] = useState<SelectedTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // Track the current audio source URL to detect changes
  const currentAudioUrlRef = useRef<string | null>(null);
  
  const tracks = getAllTracks();
  
  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);
  
  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setSelectedTrack(null);
      setIsPlaying(false);
      setError(null);
      currentAudioUrlRef.current = null;
    }
  }, [open]);
  
  // Handle selecting a track
  const handleSelectTrack = useCallback((track: BlobbiTrack) => {
    // Stop current playback
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
    
    setSelectedTrack({ track, url: track.url });
    setError(null);
  }, []);
  
  // Handle play/pause preview
  const handleTogglePlay = useCallback(() => {
    if (!selectedTrack) return;
    
    const audioUrl = selectedTrack.url;
    
    // Check if we need to create a new Audio instance (source changed or first time)
    const needsNewAudio = !audioRef.current || currentAudioUrlRef.current !== audioUrl;
    
    if (needsNewAudio) {
      // Stop and cleanup old audio if exists
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.onended = null;
        audioRef.current.onerror = null;
      }
      
      // Create new Audio instance with the correct source
      audioRef.current = new Audio(audioUrl);
      currentAudioUrlRef.current = audioUrl;
      
      audioRef.current.onended = () => setIsPlaying(false);
      audioRef.current.onerror = () => {
        setError('Failed to load this track. Please try another one.');
        setIsPlaying(false);
      };
    }
    
    if (isPlaying && !needsNewAudio) {
      // Pause current playback
      audioRef.current?.pause();
      setIsPlaying(false);
    } else {
      // Start playback (either new source or resuming)
      audioRef.current?.play().catch(() => {
        setError('Failed to play this track. Please try another one.');
        setIsPlaying(false);
      });
      setIsPlaying(true);
    }
  }, [selectedTrack, isPlaying]);
  
  // Handle confirm
  const handleConfirm = useCallback(() => {
    if (!selectedTrack) return;
    
    // Stop playback
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
    onConfirm(selectedTrack);
  }, [selectedTrack, onConfirm]);
  
  // Handle close
  const handleClose = useCallback((isOpen: boolean) => {
    if (!isOpen && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
    onOpenChange(isOpen);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col p-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-gradient-to-br from-pink-500/20 to-pink-500/5 flex items-center justify-center">
              <Music className="size-5 text-pink-500" />
            </div>
            <div>
              <DialogTitle className="text-xl">Play Music</DialogTitle>
              <p className="text-sm text-muted-foreground">
                Choose a track to play for your Blobbi
              </p>
            </div>
          </div>
        </DialogHeader>

        {/* Content - Track List */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="grid gap-2">
            {tracks.map((track) => (
              <TrackRow
                key={track.id}
                track={track}
                isSelected={selectedTrack?.track.id === track.id}
                onSelect={() => handleSelectTrack(track)}
              />
            ))}
          </div>
          {error && (
            <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <div className="flex items-start gap-2">
                <AlertCircle className="size-4 text-amber-500 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-600 dark:text-amber-400">{error}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-muted/30">
          {/* Preview Controls */}
          {selectedTrack && (
            <div className="mb-4 p-3 rounded-lg bg-card border">
              <div className="flex items-center gap-3">
                <Button
                  size="icon"
                  variant="outline"
                  onClick={handleTogglePlay}
                  className="size-10 rounded-full shrink-0"
                >
                  {isPlaying ? (
                    <Pause className="size-4" />
                  ) : (
                    <Play className="size-4 ml-0.5" />
                  )}
                </Button>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate text-sm">{selectedTrack.track.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {isPlaying ? 'Now playing...' : 'Click to preview'}
                  </p>
                </div>
                {isPlaying && (
                  <Volume2 className="size-4 text-primary animate-pulse shrink-0" />
                )}
              </div>
            </div>
          )}
          
          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => handleClose(false)}
              className="flex-1"
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!selectedTrack || isLoading}
              className="flex-1"
            >
              {isLoading ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  Playing...
                </>
              ) : (
                <>
                  <Music className="size-4 mr-2" />
                  Play for Blobbi
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Track Row Component ──────────────────────────────────────────────────────

interface TrackRowProps {
  track: BlobbiTrack;
  isSelected: boolean;
  onSelect: () => void;
}

function TrackRow({ track, isSelected, onSelect }: TrackRowProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full p-3 rounded-xl text-left transition-all",
        "border hover:border-primary/30",
        isSelected 
          ? "border-primary bg-primary/5 ring-2 ring-primary/20" 
          : "border-border bg-card/60"
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn(
          "size-10 rounded-lg flex items-center justify-center",
          isSelected ? "bg-primary/20" : "bg-muted"
        )}>
          <Music className={cn(
            "size-5",
            isSelected ? "text-primary" : "text-muted-foreground"
          )} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{track.title}</p>
          <p className="text-sm text-muted-foreground">{track.artist}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm text-muted-foreground">
            {formatTrackDuration(track.durationSeconds)}
          </span>
          {isSelected && <Check className="size-4 text-primary" />}
        </div>
      </div>
    </button>
  );
}
