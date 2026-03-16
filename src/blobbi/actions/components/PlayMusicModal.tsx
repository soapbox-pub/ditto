// src/blobbi/actions/components/PlayMusicModal.tsx

import { useState, useRef, useCallback, useEffect } from 'react';
import { Music, Upload, Play, Pause, Check, Loader2, Volume2, X, AlertCircle } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

import {
  getAllBuiltInTracks,
  formatTrackDuration,
  type BuiltInTrack,
} from '../lib/blobbi-builtin-tracks';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlayMusicModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isLoading: boolean;
}

type AudioSource = 
  | { type: 'builtin'; track: BuiltInTrack }
  | { type: 'uploaded'; file: File; url: string };

// ─── Component ────────────────────────────────────────────────────────────────

export function PlayMusicModal({
  open,
  onOpenChange,
  onConfirm,
  isLoading,
}: PlayMusicModalProps) {
  const [selectedSource, setSelectedSource] = useState<AudioSource | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [builtInError, setBuiltInError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const builtInTracks = getAllBuiltInTracks();
  
  // Cleanup audio on unmount or modal close
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      // Revoke object URL if it was an uploaded file
      if (selectedSource?.type === 'uploaded') {
        URL.revokeObjectURL(selectedSource.url);
      }
    };
  }, [selectedSource]);
  
  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setSelectedSource(null);
      setIsPlaying(false);
      setUploadError(null);
      setBuiltInError(null);
    }
  }, [open]);
  
  // Handle selecting a built-in track
  const handleSelectBuiltIn = useCallback((track: BuiltInTrack) => {
    // Stop current playback
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
    
    // Revoke previous URL if uploaded
    if (selectedSource?.type === 'uploaded') {
      URL.revokeObjectURL(selectedSource.url);
    }
    
    setSelectedSource({ type: 'builtin', track });
    setBuiltInError(null);
  }, [selectedSource]);
  
  // Handle file upload
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validate file type
    const validTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a', 'audio/mp4'];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|ogg|m4a)$/i)) {
      setUploadError('Please upload an MP3, WAV, OGG, or M4A file.');
      return;
    }
    
    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      setUploadError('File is too large. Maximum size is 10MB.');
      return;
    }
    
    // Stop current playback
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
    
    // Revoke previous URL if uploaded
    if (selectedSource?.type === 'uploaded') {
      URL.revokeObjectURL(selectedSource.url);
    }
    
    const url = URL.createObjectURL(file);
    setSelectedSource({ type: 'uploaded', file, url });
    setUploadError(null);
  }, [selectedSource]);
  
  // Handle play/pause preview
  const handleTogglePlay = useCallback(() => {
    if (!selectedSource) return;
    
    const audioUrl = selectedSource.type === 'builtin' 
      ? selectedSource.track.path 
      : selectedSource.url;
    
    if (!audioRef.current) {
      audioRef.current = new Audio(audioUrl);
      audioRef.current.onended = () => setIsPlaying(false);
      audioRef.current.onerror = () => {
        if (selectedSource.type === 'builtin') {
          setBuiltInError('This track is not available yet. Try uploading your own music!');
        }
        setIsPlaying(false);
      };
    }
    
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(() => {
        if (selectedSource.type === 'builtin') {
          setBuiltInError('This track is not available yet. Try uploading your own music!');
        }
        setIsPlaying(false);
      });
      setIsPlaying(true);
    }
  }, [selectedSource, isPlaying]);
  
  // Handle confirm
  const handleConfirm = useCallback(() => {
    // Stop playback
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
    onConfirm();
  }, [onConfirm]);
  
  // Handle close
  const handleClose = useCallback((isOpen: boolean) => {
    if (!isOpen && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
    onOpenChange(isOpen);
  }, [onOpenChange]);
  
  const selectedName = selectedSource?.type === 'builtin' 
    ? selectedSource.track.title 
    : selectedSource?.type === 'uploaded'
    ? selectedSource.file.name
    : null;

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

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <Tabs defaultValue="builtin" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="builtin">Built-in</TabsTrigger>
              <TabsTrigger value="upload">Upload</TabsTrigger>
            </TabsList>
            
            {/* Built-in Tracks Tab */}
            <TabsContent value="builtin" className="mt-4">
              <div className="grid gap-2">
                {builtInTracks.map((track) => (
                  <TrackRow
                    key={track.id}
                    track={track}
                    isSelected={selectedSource?.type === 'builtin' && selectedSource.track.id === track.id}
                    onSelect={() => handleSelectBuiltIn(track)}
                  />
                ))}
              </div>
              {builtInError && (
                <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="size-4 text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-sm text-amber-600 dark:text-amber-400">{builtInError}</p>
                  </div>
                </div>
              )}
            </TabsContent>
            
            {/* Upload Tab */}
            <TabsContent value="upload" className="mt-4">
              <div className="space-y-4">
                {/* Upload Area */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "w-full p-8 rounded-xl border-2 border-dashed transition-colors",
                    "hover:border-primary/50 hover:bg-primary/5",
                    "flex flex-col items-center justify-center gap-3",
                    selectedSource?.type === 'uploaded' 
                      ? "border-primary/30 bg-primary/5" 
                      : "border-border"
                  )}
                >
                  <div className="size-12 rounded-full bg-muted flex items-center justify-center">
                    <Upload className="size-6 text-muted-foreground" />
                  </div>
                  <div className="text-center">
                    <p className="font-medium">Upload Audio File</p>
                    <p className="text-sm text-muted-foreground">
                      MP3, WAV, OGG, M4A (max 10MB)
                    </p>
                  </div>
                </button>
                
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                
                {/* Upload Error */}
                {uploadError && (
                  <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                    <div className="flex items-start gap-2">
                      <X className="size-4 text-destructive mt-0.5 shrink-0" />
                      <p className="text-sm text-destructive">{uploadError}</p>
                    </div>
                  </div>
                )}
                
                {/* Uploaded File Display */}
                {selectedSource?.type === 'uploaded' && (
                  <div className="p-4 rounded-xl border bg-card/60">
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Music className="size-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{selectedSource.file.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {(selectedSource.file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                      <Check className="size-5 text-primary shrink-0" />
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-muted/30">
          {/* Preview Controls */}
          {selectedSource && (
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
                  <p className="font-medium truncate text-sm">{selectedName}</p>
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
              disabled={!selectedSource || isLoading}
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
  track: BuiltInTrack;
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
