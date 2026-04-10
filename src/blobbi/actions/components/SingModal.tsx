// src/blobbi/actions/components/SingModal.tsx

import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff, Play, Pause, Square, Loader2, AlertCircle, RotateCcw, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { getRandomLyrics, type LyricsEntry } from '../lib/blobbi-random-lyrics';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isLoading: boolean;
}

type RecordingState = 'idle' | 'requesting' | 'recording' | 'recorded' | 'playing' | 'error';

// ─── MIME Type Selection Helper ───────────────────────────────────────────────

/**
 * Ordered list of MIME types to try for audio recording.
 * The first supported type will be used.
 */
const AUDIO_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
] as const;

/**
 * Get the first supported MIME type for MediaRecorder.
 * Returns undefined if no explicit MIME type is supported (let browser decide).
 */
function getSupportedAudioMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') {
    return undefined;
  }
  
  for (const mimeType of AUDIO_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }
  
  // No explicit MIME type supported, let browser use default
  return undefined;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SingModal({
  open,
  onOpenChange,
  onConfirm,
  isLoading,
}: SingModalProps) {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [currentLyrics, setCurrentLyrics] = useState<LyricsEntry | null>(null);
  const [showLyrics, setShowLyrics] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Track the actual MIME type used by the recorder
  const actualMimeTypeRef = useRef<string | undefined>(undefined);
  
  const cleanup = useCallback(() => {
    // Stop timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    // Stop media recorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    
    // Stop stream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    // Stop audio playback
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    
    // Revoke URL
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
  }, [audioUrl]);
  
  const resetRecording = useCallback(() => {
    cleanup();
    setRecordingState('idle');
    setError(null);
    setPlaybackError(null);
    setRecordingDuration(0);
    setAudioUrl(null);
    chunksRef.current = [];
    currentPlaybackUrlRef.current = null;
    actualMimeTypeRef.current = undefined;
    // Keep lyrics when re-recording so user can sing the same song
  }, [cleanup]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);
  
  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      resetRecording();
    } else {
      cleanup();
    }
  }, [open, cleanup, resetRecording]);
  
  // Handle getting random lyrics
  const handleRandomLyrics = useCallback(() => {
    const lyrics = getRandomLyrics();
    setCurrentLyrics(lyrics);
    setShowLyrics(true);
  }, []);
  
  // Check if browser supports media recording
  const checkRecordingSupport = (): boolean => {
    if (typeof navigator === 'undefined') return false;
    if (!navigator.mediaDevices) return false;
    if (!navigator.mediaDevices.getUserMedia) return false;
    if (typeof MediaRecorder === 'undefined') return false;
    return true;
  };
  
  // Start recording
  const startRecording = useCallback(async () => {
    if (!checkRecordingSupport()) {
      setError('Audio recording is not supported in this browser.');
      setRecordingState('error');
      return;
    }
    
    setRecordingState('requesting');
    setError(null);
    setPlaybackError(null);
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      
      streamRef.current = stream;
      chunksRef.current = [];
      
      // Get the first supported MIME type using our helper
      const supportedMimeType = getSupportedAudioMimeType();
      
      // Create MediaRecorder with or without explicit MIME type
      let mediaRecorder: MediaRecorder;
      if (supportedMimeType) {
        mediaRecorder = new MediaRecorder(stream, { mimeType: supportedMimeType });
      } else {
        // Let browser choose default MIME type
        mediaRecorder = new MediaRecorder(stream);
      }
      
      // Store the actual MIME type being used (may differ from what we requested)
      actualMimeTypeRef.current = mediaRecorder.mimeType || supportedMimeType;
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        // Create blob from chunks using the actual MIME type used by the recorder
        const blobMimeType = actualMimeTypeRef.current || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: blobMimeType });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setRecordingState('recorded');
        
        // Stop stream tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
      };
      
      mediaRecorder.onerror = () => {
        setError('Recording failed. Please try again.');
        setRecordingState('error');
      };
      
      // Start recording
      mediaRecorder.start(100); // Collect data every 100ms
      setRecordingState('recording');
      setRecordingDuration(0);
      
      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
      
    } catch (err) {
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setError('Microphone access was denied. Please allow microphone access and try again.');
        } else if (err.name === 'NotFoundError') {
          setError('No microphone found. Please connect a microphone and try again.');
        } else {
          setError(`Failed to access microphone: ${err.message}`);
        }
      } else {
        setError('Failed to access microphone. Please try again.');
      }
      setRecordingState('error');
    }
  }, []);
  
  // Stop recording
  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);
  
  // Track the current audio URL to detect changes
  const currentPlaybackUrlRef = useRef<string | null>(null);
  
  // Play/pause preview
  const togglePlayback = useCallback(() => {
    if (!audioUrl) return;
    
    // Clear previous playback error when attempting to play
    setPlaybackError(null);
    
    if (recordingState === 'playing') {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setRecordingState('recorded');
    } else {
      // Check if we need to create a new Audio instance (URL changed or first time)
      const needsNewAudio = !audioRef.current || currentPlaybackUrlRef.current !== audioUrl;
      
      if (needsNewAudio) {
        // Cleanup old audio if exists
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.onended = null;
          audioRef.current.onerror = null;
        }
        
        // Create new Audio instance with the recorded audio URL
        audioRef.current = new Audio(audioUrl);
        currentPlaybackUrlRef.current = audioUrl;
        audioRef.current.onended = () => setRecordingState('recorded');
        
        // Handle playback errors with user-visible message
        audioRef.current.onerror = () => {
          setPlaybackError('This browser could not play the recorded audio preview. Your recording was still created successfully.');
          setRecordingState('recorded');
        };
      }
      
      audioRef.current?.play()
        .then(() => {
          setRecordingState('playing');
        })
        .catch((err) => {
          console.error('Failed to play recording:', err);
          // Provide user-friendly error message
          if (err.name === 'NotSupportedError') {
            setPlaybackError('Recording was created, but playback preview is not supported in this browser.');
          } else if (err.name === 'NotAllowedError') {
            setPlaybackError('Playback was blocked. Try interacting with the page first.');
          } else {
            setPlaybackError('Could not play the recording preview. Your recording was still created successfully.');
          }
          setRecordingState('recorded');
        });
    }
  }, [audioUrl, recordingState]);
  
  // Handle confirm
  const handleConfirm = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    onConfirm();
  }, [onConfirm]);
  
  // Handle close
  const handleClose = useCallback((isOpen: boolean) => {
    if (!isOpen) {
      cleanup();
    }
    onOpenChange(isOpen);
  }, [onOpenChange, cleanup]);
  
  // Format duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  const hasRecording = recordingState === 'recorded' || recordingState === 'playing';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col p-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-500/5 flex items-center justify-center">
              <Mic className="size-5 text-purple-500" />
            </div>
            <div>
              <DialogTitle className="text-xl">Sing</DialogTitle>
              <p className="text-sm text-muted-foreground">
                Record yourself singing for your Blobbi
              </p>
            </div>
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 px-6 py-8">
          <div className="flex flex-col items-center justify-center gap-6">
            {/* Recording Visualization */}
            <div className={cn(
              "relative size-40 rounded-full flex items-center justify-center transition-all",
              recordingState === 'recording' && "animate-pulse",
              recordingState === 'recording' 
                ? "bg-red-500/10 ring-4 ring-red-500/30" 
                : hasRecording
                ? "bg-purple-500/10 ring-4 ring-purple-500/30"
                : "bg-muted"
            )}>
              {/* Animated rings for recording */}
              {recordingState === 'recording' && (
                <>
                  <div className="absolute inset-0 rounded-full bg-red-500/10 animate-ping" />
                  <div className="absolute inset-4 rounded-full bg-red-500/10 animate-ping animation-delay-150" />
                </>
              )}
              
              {/* Icon */}
              <div className={cn(
                "relative size-20 rounded-full flex items-center justify-center",
                recordingState === 'recording' 
                  ? "bg-red-500 text-white" 
                  : hasRecording
                  ? "bg-purple-500 text-white"
                  : "bg-muted-foreground/20"
              )}>
                {recordingState === 'requesting' ? (
                  <Loader2 className="size-8 animate-spin" />
                ) : recordingState === 'recording' ? (
                  <Mic className="size-8" />
                ) : hasRecording ? (
                  recordingState === 'playing' ? (
                    <Pause className="size-8" />
                  ) : (
                    <Play className="size-8 ml-1" />
                  )
                ) : (
                  <MicOff className="size-8 text-muted-foreground" />
                )}
              </div>
            </div>
            
            {/* Duration / Status */}
            <div className="text-center">
              {recordingState === 'idle' && (
                <p className="text-muted-foreground">Tap the button below to start recording</p>
              )}
              {recordingState === 'requesting' && (
                <p className="text-muted-foreground">Requesting microphone access...</p>
              )}
              {recordingState === 'recording' && (
                <>
                  <p className="text-3xl font-mono font-bold text-red-500">
                    {formatDuration(recordingDuration)}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">Recording...</p>
                </>
              )}
              {hasRecording && (
                <>
                  <p className="text-3xl font-mono font-bold text-purple-500">
                    {formatDuration(recordingDuration)}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {recordingState === 'playing' ? 'Playing...' : 'Tap to preview'}
                  </p>
                </>
              )}
              {recordingState === 'error' && (
                <p className="text-destructive">Recording failed</p>
              )}
            </div>
            
            {/* Error Message */}
            {error && (
              <div className="w-full p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                <div className="flex items-start gap-2">
                  <AlertCircle className="size-4 text-destructive mt-0.5 shrink-0" />
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              </div>
            )}
            
            {/* Playback Error Message (non-fatal, recording still works) */}
            {playbackError && (
              <div className="w-full p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                <div className="flex items-start gap-2">
                  <AlertCircle className="size-4 text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-amber-600 dark:text-amber-400">{playbackError}</p>
                </div>
              </div>
            )}
            
            {/* Lyrics Helper */}
            <div className="w-full">
              {!currentLyrics ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRandomLyrics}
                  className="w-full gap-2"
                >
                  <Sparkles className="size-4" />
                  Need lyrics? Get random lyrics
                </Button>
              ) : (
                <div className="rounded-lg border bg-card/60">
                  <button
                    type="button"
                    onClick={() => setShowLyrics(!showLyrics)}
                    className="w-full flex items-center justify-between p-3 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles className="size-4 text-purple-500" />
                      <span className="font-medium text-sm">{currentLyrics.title}</span>
                    </div>
                    {showLyrics ? (
                      <ChevronUp className="size-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="size-4 text-muted-foreground" />
                    )}
                  </button>
                  {showLyrics && (
                    <div className="px-3 pb-3 pt-0">
                      <div className="p-3 rounded-md bg-muted/50 text-sm leading-relaxed whitespace-pre-line">
                        {currentLyrics.lines.join('\n')}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleRandomLyrics}
                        className="w-full mt-2 gap-2 text-muted-foreground"
                      >
                        <RotateCcw className="size-3" />
                        Get different lyrics
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {/* Recording Controls */}
            <div className="flex items-center gap-3">
              {recordingState === 'idle' || recordingState === 'error' ? (
                <Button
                  size="lg"
                  onClick={startRecording}
                  className="rounded-full px-8 bg-purple-500 hover:bg-purple-600"
                >
                  <Mic className="size-5 mr-2" />
                  Start Recording
                </Button>
              ) : recordingState === 'recording' ? (
                <Button
                  size="lg"
                  variant="destructive"
                  onClick={stopRecording}
                  className="rounded-full px-8"
                >
                  <Square className="size-5 mr-2" />
                  Stop
                </Button>
              ) : hasRecording ? (
                <>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={togglePlayback}
                    className="rounded-full"
                  >
                    {recordingState === 'playing' ? (
                      <>
                        <Pause className="size-5 mr-2" />
                        Pause
                      </>
                    ) : (
                      <>
                        <Play className="size-5 mr-2" />
                        Preview
                      </>
                    )}
                  </Button>
                  <Button
                    size="lg"
                    variant="ghost"
                    onClick={resetRecording}
                    className="rounded-full"
                  >
                    <RotateCcw className="size-5 mr-2" />
                    Re-record
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-muted/30">
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
              disabled={!hasRecording || isLoading}
              className="flex-1"
            >
              {isLoading ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  Singing...
                </>
              ) : (
                <>
                  <Mic className="size-4 mr-2" />
                  Sing for Blobbi
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
