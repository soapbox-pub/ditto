// src/blobbi/actions/components/SingModal.tsx

import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff, Play, Pause, Square, Loader2, AlertCircle, RotateCcw } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isLoading: boolean;
}

type RecordingState = 'idle' | 'requesting' | 'recording' | 'recorded' | 'playing' | 'error';

// ─── Component ────────────────────────────────────────────────────────────────

export function SingModal({
  open,
  onOpenChange,
  onConfirm,
  isLoading,
}: SingModalProps) {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);
  
  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      resetRecording();
    } else {
      cleanup();
    }
  }, [open]);
  
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
    setRecordingDuration(0);
    setAudioUrl(null);
    chunksRef.current = [];
  }, [cleanup]);
  
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
      
      // Determine supported MIME type
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') 
        ? 'audio/webm' 
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : 'audio/ogg';
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        // Create blob from chunks
        const blob = new Blob(chunksRef.current, { type: mimeType });
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
  
  // Play/pause preview
  const togglePlayback = useCallback(() => {
    if (!audioUrl) return;
    
    if (recordingState === 'playing') {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setRecordingState('recorded');
    } else {
      if (!audioRef.current) {
        audioRef.current = new Audio(audioUrl);
        audioRef.current.onended = () => setRecordingState('recorded');
      }
      audioRef.current.play();
      setRecordingState('playing');
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
