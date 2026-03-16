// src/blobbi/actions/hooks/useAudioPlayback.ts

import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Audio playback state
 * - idle: No audio loaded
 * - loading: Audio is being loaded
 * - playing: Audio is playing
 * - paused: Audio is paused (can resume)
 * - stopped: Audio was stopped (must reload to play again)
 * - error: An error occurred
 */
export type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'stopped' | 'error';

/**
 * Audio playback error info
 */
export interface PlaybackError {
  message: string;
  code?: string;
}

/**
 * Options for the useAudioPlayback hook
 */
export interface UseAudioPlaybackOptions {
  /** Called when playback ends naturally */
  onEnded?: () => void;
  /** Called when an error occurs */
  onError?: (error: PlaybackError) => void;
}

/**
 * Return type for useAudioPlayback hook
 */
export interface UseAudioPlaybackReturn {
  /** Current playback state */
  state: PlaybackState;
  /** Current error (if any) */
  error: PlaybackError | null;
  /** Current audio URL being played */
  currentUrl: string | null;
  /** Load and optionally start playing an audio URL */
  load: (url: string, autoplay?: boolean) => void;
  /** Play the current audio */
  play: () => Promise<void>;
  /** Pause the current audio */
  pause: () => void;
  /** Stop playback and reset */
  stop: () => void;
  /** Restart playback from the beginning */
  restart: () => Promise<void>;
  /** Toggle play/pause */
  toggle: () => Promise<void>;
  /** Whether audio is currently playing */
  isPlaying: boolean;
  /** Cleanup function to release resources */
  cleanup: () => void;
}

/**
 * Reusable hook for audio playback.
 * Handles Audio element lifecycle, error handling, and state management.
 */
export function useAudioPlayback(options: UseAudioPlaybackOptions = {}): UseAudioPlaybackReturn {
  const { onEnded, onError } = options;
  
  const [state, setState] = useState<PlaybackState>('idle');
  const [error, setError] = useState<PlaybackError | null>(null);
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentUrlRef = useRef<string | null>(null);
  
  // Cleanup audio element
  const cleanup = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.oncanplay = null;
      audioRef.current.onplaying = null;
      audioRef.current = null;
    }
    currentUrlRef.current = null;
    setState('idle');
    setCurrentUrl(null);
    setError(null);
  }, []);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);
  
  // Load audio from URL
  const load = useCallback((url: string, autoplay = false) => {
    // If same URL, don't reload
    if (currentUrlRef.current === url && audioRef.current) {
      if (autoplay) {
        audioRef.current.play().catch(() => {});
      }
      return;
    }
    
    // Cleanup previous audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.oncanplay = null;
      audioRef.current.onplaying = null;
    }
    
    setState('loading');
    setError(null);
    setCurrentUrl(url);
    currentUrlRef.current = url;
    
    const audio = new Audio(url);
    audioRef.current = audio;
    
    audio.oncanplay = () => {
      if (autoplay) {
        audio.play().catch((err) => {
          const playbackError: PlaybackError = {
            message: getPlaybackErrorMessage(err),
            code: err.name,
          };
          setError(playbackError);
          setState('error');
          onError?.(playbackError);
        });
      } else {
        setState('paused');
      }
    };
    
    audio.onplaying = () => {
      setState('playing');
    };
    
    audio.onpause = () => {
      if (state === 'playing') {
        setState('paused');
      }
    };
    
    audio.onended = () => {
      setState('paused');
      onEnded?.();
    };
    
    audio.onerror = () => {
      const playbackError: PlaybackError = {
        message: 'Failed to load audio. The format may not be supported.',
        code: 'MEDIA_ERR',
      };
      setError(playbackError);
      setState('error');
      onError?.(playbackError);
    };
    
    // Start loading
    audio.load();
  }, [onEnded, onError, state]);
  
  // Play current audio
  const play = useCallback(async () => {
    if (!audioRef.current) return;
    
    try {
      setError(null);
      await audioRef.current.play();
      setState('playing');
    } catch (err) {
      const playbackError: PlaybackError = {
        message: getPlaybackErrorMessage(err),
        code: err instanceof Error ? err.name : 'UNKNOWN',
      };
      setError(playbackError);
      setState('error');
      onError?.(playbackError);
    }
  }, [onError]);
  
  // Pause current audio
  const pause = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    setState('paused');
  }, []);
  
  // Stop playback completely (requires reload to play again)
  const stop = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    // Clear URL ref so next load() will actually reload
    currentUrlRef.current = null;
    setState('stopped');
  }, []);
  
  // Restart playback from the beginning
  const restart = useCallback(async () => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = 0;
    try {
      await audioRef.current.play();
      setState('playing');
    } catch (err) {
      const playbackError: PlaybackError = {
        message: getPlaybackErrorMessage(err),
        code: err instanceof Error ? err.name : 'UNKNOWN',
      };
      setError(playbackError);
      setState('error');
      onError?.(playbackError);
    }
  }, [onError]);
  
  // Toggle play/pause
  const toggle = useCallback(async () => {
    if (state === 'playing') {
      pause();
    } else {
      await play();
    }
  }, [state, play, pause]);
  
  return {
    state,
    error,
    currentUrl,
    load,
    play,
    pause,
    stop,
    restart,
    toggle,
    isPlaying: state === 'playing',
    cleanup,
  };
}

/**
 * Get a user-friendly error message for playback errors
 */
function getPlaybackErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'NotSupportedError') {
      return 'This audio format is not supported by your browser.';
    }
    if (err.name === 'NotAllowedError') {
      return 'Playback was blocked. Try interacting with the page first.';
    }
    return err.message;
  }
  return 'An unknown error occurred during playback.';
}
