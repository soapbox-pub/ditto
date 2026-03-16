// src/blobbi/actions/components/InlineSingCard.tsx

import { useState, useRef, useCallback, useEffect } from 'react';
import { 
  Mic, 
  Play, 
  Pause, 
  Square, 
  FileText, 
  Check, 
  X, 
  Loader2, 
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { useAudioPlayback } from '../hooks/useAudioPlayback';
import { getRandomLyrics, type LyricsEntry } from '../lib/blobbi-random-lyrics';

// ─── Types ────────────────────────────────────────────────────────────────────

type RecordingState = 'idle' | 'requesting' | 'recording' | 'recorded' | 'error';

interface InlineSingCardProps {
  /** Called when user confirms the singing action (publish the action) */
  onConfirm: () => Promise<void>;
  /** Called when user closes the sing card */
  onClose: () => void;
  /** Called when recording starts (for Blobbi reaction) */
  onRecordingStart?: () => void;
  /** Called when recording stops (for Blobbi reaction) */
  onRecordingStop?: () => void;
  /** Whether publishing is in progress */
  isPublishing: boolean;
}

// ─── MIME Type Selection ──────────────────────────────────────────────────────

const AUDIO_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
] as const;

function getSupportedAudioMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') {
    return undefined;
  }
  
  for (const mimeType of AUDIO_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }
  
  return undefined;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function InlineSingCard({
  onConfirm,
  onClose,
  onRecordingStart,
  onRecordingStop,
  isPublishing,
}: InlineSingCardProps) {
  // Recording state
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  
  // Lyrics state
  const [currentLyrics, setCurrentLyrics] = useState<LyricsEntry | null>(null);
  const [showLyrics, setShowLyrics] = useState(false);
  
  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const actualMimeTypeRef = useRef<string | undefined>(undefined);
  
  // Audio playback for preview
  const {
    state: playbackState,
    error: playbackError,
    load: loadAudio,
    toggle: togglePlayback,
    stop: stopPlayback,
    isPlaying,
    cleanup: cleanupPlayback,
  } = useAudioPlayback();
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupAll();
    };
  }, []);
  
  // Cleanup all resources
  const cleanupAll = useCallback(() => {
    // Stop timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    // Stop media recorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // Ignore errors during cleanup
      }
    }
    mediaRecorderRef.current = null;
    
    // Stop stream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    // Cleanup playback
    cleanupPlayback();
    
    // Revoke URL
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
  }, [audioUrl, cleanupPlayback]);
  
  // Reset recording
  const resetRecording = useCallback(() => {
    cleanupAll();
    setRecordingState('idle');
    setRecordingError(null);
    setRecordingDuration(0);
    setAudioUrl(null);
    chunksRef.current = [];
    actualMimeTypeRef.current = undefined;
    // Keep lyrics
  }, [cleanupAll]);
  
  // Check browser support
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
      setRecordingError('Audio recording is not supported in this browser.');
      setRecordingState('error');
      return;
    }
    
    setRecordingState('requesting');
    setRecordingError(null);
    
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
      
      // Get supported MIME type
      const supportedMimeType = getSupportedAudioMimeType();
      
      // Create MediaRecorder
      let mediaRecorder: MediaRecorder;
      if (supportedMimeType) {
        mediaRecorder = new MediaRecorder(stream, { mimeType: supportedMimeType });
      } else {
        mediaRecorder = new MediaRecorder(stream);
      }
      
      actualMimeTypeRef.current = mediaRecorder.mimeType || supportedMimeType;
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const blobMimeType = actualMimeTypeRef.current || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: blobMimeType });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setRecordingState('recorded');
        
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
      };
      
      mediaRecorder.onerror = () => {
        setRecordingError('Recording failed. Please try again.');
        setRecordingState('error');
      };
      
      mediaRecorder.start(100);
      setRecordingState('recording');
      setRecordingDuration(0);
      
      // Notify parent that recording started (for Blobbi reaction)
      onRecordingStart?.();
      
      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
      
    } catch (err) {
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setRecordingError('Microphone access was denied.');
        } else if (err.name === 'NotFoundError') {
          setRecordingError('No microphone found.');
        } else {
          setRecordingError(err.message);
        }
      } else {
        setRecordingError('Failed to access microphone.');
      }
      setRecordingState('error');
    }
  }, [onRecordingStart]);
  
  // Stop recording
  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    
    // Notify parent that recording stopped (for Blobbi reaction)
    onRecordingStop?.();
  }, [onRecordingStop]);
  
  // Handle preview playback
  const handlePreview = useCallback(() => {
    if (!audioUrl) return;
    
    if (playbackState === 'idle') {
      loadAudio(audioUrl, true);
    } else {
      togglePlayback();
    }
  }, [audioUrl, playbackState, loadAudio, togglePlayback]);
  
  // Handle confirm
  const handleConfirm = useCallback(async () => {
    stopPlayback();
    await onConfirm();
    // After successful publish, close the card
    onClose();
  }, [stopPlayback, onConfirm, onClose]);
  
  // Handle close
  const handleClose = useCallback(() => {
    cleanupAll();
    onClose();
  }, [cleanupAll, onClose]);
  
  // Handle lyrics toggle
  const handleLyricsToggle = useCallback(() => {
    if (!currentLyrics && !showLyrics) {
      // Generate lyrics on first open
      setCurrentLyrics(getRandomLyrics());
    }
    setShowLyrics(!showLyrics);
  }, [currentLyrics, showLyrics]);
  
  // Get new lyrics
  const handleNewLyrics = useCallback(() => {
    setCurrentLyrics(getRandomLyrics());
  }, []);
  
  // Format duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  const hasRecording = recordingState === 'recorded';
  const isRecording = recordingState === 'recording';
  const canConfirm = hasRecording && !isPublishing;
  
  return (
    <div className="mx-4 sm:mx-6 mb-4">
      <div className={cn(
        "rounded-xl border bg-card/80 backdrop-blur-sm overflow-hidden",
        "shadow-sm transition-all",
        isRecording && "ring-2 ring-red-500/30"
      )}>
        {/* Lyrics panel (expands upward visually by being above controls) */}
        {showLyrics && currentLyrics && (
          <div className="px-3 pt-3 pb-2 border-b border-border/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">{currentLyrics.title}</span>
              <Button
                size="icon"
                variant="ghost"
                onClick={handleNewLyrics}
                className="size-7 rounded-full"
              >
                <RefreshCw className="size-3" />
              </Button>
            </div>
            <div className="p-3 rounded-lg bg-muted/50 text-sm leading-relaxed whitespace-pre-line max-h-32 overflow-y-auto">
              {currentLyrics.lines.join('\n')}
            </div>
          </div>
        )}
        
        {/* Status row (recording/recorded info) */}
        {(isRecording || hasRecording) && (
          <div className="px-3 pt-3 pb-2 border-b border-border/50">
            <div className="flex items-center justify-center gap-2">
              {isRecording && (
                <>
                  <div className="size-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-sm font-mono font-medium text-red-500">
                    {formatDuration(recordingDuration)}
                  </span>
                  <span className="text-xs text-muted-foreground">Recording...</span>
                </>
              )}
              {hasRecording && !isRecording && (
                <>
                  <Check className="size-4 text-purple-500" />
                  <span className="text-sm font-mono font-medium text-purple-500">
                    {formatDuration(recordingDuration)}
                  </span>
                  <span className="text-xs text-muted-foreground">Recorded</span>
                </>
              )}
            </div>
          </div>
        )}
        
        {/* Error message */}
        {(recordingError || playbackError) && (
          <div className="px-3 pt-2">
            <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <AlertCircle className="size-4 mt-0.5 shrink-0" />
              <p className="text-xs">{recordingError || playbackError?.message}</p>
            </div>
          </div>
        )}
        
        {/* Main controls row */}
        <div className="flex items-center justify-between gap-2 p-3">
          {/* Left: Lyrics button */}
          <Button
            size="icon"
            variant={showLyrics ? "secondary" : "ghost"}
            onClick={handleLyricsToggle}
            className="size-10 rounded-full shrink-0"
          >
            <FileText className="size-4" />
          </Button>
          
          {/* Center: Record/Stop button */}
          <div className="flex items-center gap-2">
            {!isRecording && !hasRecording && (
              <Button
                onClick={startRecording}
                disabled={isPublishing}
                className="rounded-full px-6 bg-purple-500 hover:bg-purple-600"
              >
                <Mic className="size-4 mr-2" />
                Sing
              </Button>
            )}
            
            {isRecording && (
              <Button
                onClick={stopRecording}
                variant="destructive"
                className="rounded-full px-6"
              >
                <Square className="size-4 mr-2" />
                Stop
              </Button>
            )}
            
            {hasRecording && !isRecording && (
              <>
                <Button
                  onClick={resetRecording}
                  variant="outline"
                  size="icon"
                  className="size-10 rounded-full"
                >
                  <RefreshCw className="size-4" />
                </Button>
                
                <Button
                  onClick={handleConfirm}
                  disabled={!canConfirm}
                  className="rounded-full px-6 bg-purple-500 hover:bg-purple-600"
                >
                  {isPublishing ? (
                    <Loader2 className="size-4 mr-2 animate-spin" />
                  ) : (
                    <Check className="size-4 mr-2" />
                  )}
                  {isPublishing ? 'Singing...' : 'Sing for Blobbi'}
                </Button>
              </>
            )}
          </div>
          
          {/* Right: Preview button (when recording exists) */}
          {hasRecording ? (
            <Button
              size="icon"
              variant="ghost"
              onClick={handlePreview}
              disabled={isPublishing}
              className="size-10 rounded-full shrink-0"
            >
              {isPlaying ? (
                <Pause className="size-4" />
              ) : (
                <Play className="size-4 ml-0.5" />
              )}
            </Button>
          ) : (
            /* Close button when no recording */
            <Button
              size="icon"
              variant="ghost"
              onClick={handleClose}
              className="size-10 rounded-full shrink-0 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
        
        {/* Close button row when recording exists */}
        {hasRecording && (
          <div className="px-3 pb-3 pt-0 flex justify-end">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleClose}
              disabled={isPublishing}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-3 mr-1" />
              Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
