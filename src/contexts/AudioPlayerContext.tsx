import { createContext, useContext, useRef, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';

/** A track that can be played by the global audio player. */
export interface AudioTrack {
  /** Nostr event ID. */
  id: string;
  /** Track title. */
  title: string;
  /** Artist or author name. */
  artist: string;
  /** Audio file URL. */
  url: string;
  /** Artwork/cover image URL. */
  artwork?: string;
  /** Duration in seconds (from metadata). */
  duration?: number;
  /** Navigation path to the track's detail page (e.g. /naddr1…). */
  path?: string;
}

interface AudioPlayerState {
  /** Currently loaded track. */
  currentTrack: AudioTrack | null;
  /** Playlist tracks (when playing a playlist). */
  playlist: AudioTrack[];
  /** Current index within the playlist. */
  currentIndex: number;
  /** Whether the player is minimized (floating bar). */
  minimized: boolean;
  /** Whether audio is currently playing. */
  isPlaying: boolean;
  /** Current playback time in seconds. */
  currentTime: number;
  /** Total duration in seconds. */
  duration: number;
  /** Volume (0–1). */
  volume: number;
}

interface AudioPlayerActions {
  /** Play a single track. */
  playTrack: (track: AudioTrack) => void;
  /** Play a playlist starting at a given index. */
  playPlaylist: (tracks: AudioTrack[], startIndex?: number) => void;
  /** Pause playback. */
  pause: () => void;
  /** Resume playback. */
  resume: () => void;
  /** Seek to a position in seconds. */
  seek: (time: number) => void;
  /** Set volume (0–1). */
  setVolume: (v: number) => void;
  /** Skip to next track (playlist mode). */
  nextTrack: () => void;
  /** Skip to previous track (playlist mode). */
  prevTrack: () => void;
  /** Minimize the player (show floating bar). */
  minimize: () => void;
  /** Expand the player (navigate back to source). */
  expand: () => void;
  /** Stop playback and close the player. */
  stop: () => void;
}

type AudioPlayerContextType = AudioPlayerState & AudioPlayerActions;

const AudioPlayerContext = createContext<AudioPlayerContextType | undefined>(undefined);

const VOLUME_KEY = 'audio-player-volume';

function getStoredVolume(): number {
  try {
    const v = localStorage.getItem(VOLUME_KEY);
    if (v !== null) {
      const n = parseFloat(v);
      if (isFinite(n) && n >= 0 && n <= 1) return n;
    }
  } catch { /* ignore */ }
  return 0.8;
}

export function AudioPlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);

  const [currentTrack, setCurrentTrack] = useState<AudioTrack | null>(null);
  const [playlist, setPlaylist] = useState<AudioTrack[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [minimized, setMinimized] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(getStoredVolume);

  // Sync volume to audio element
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  // Audio event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      // Auto-advance playlist
      if (playlist.length > 0 && currentIndex < playlist.length - 1) {
        const next = currentIndex + 1;
        setCurrentIndex(next);
        setCurrentTrack(playlist[next]);
        audio.src = playlist[next].url;
        audio.play().catch(() => {});
      }
    };
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDurationChange = () => {
      if (audio.duration && isFinite(audio.duration)) setDuration(audio.duration);
    };

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('loadedmetadata', onDurationChange);

    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('loadedmetadata', onDurationChange);
    };
  }, [playlist, currentIndex]);

  // Media Session API — populates Android/iOS notification panel with track info and controls
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    if (!currentTrack) {
      navigator.mediaSession.metadata = null;
      return;
    }
    const artwork: MediaImage[] = currentTrack.artwork
      ? [{ src: currentTrack.artwork, sizes: '512x512', type: 'image/jpeg' }]
      : [];
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artist,
      artwork,
    });
  }, [currentTrack]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const audio = audioRef.current;

    navigator.mediaSession.setActionHandler('play', () => audio?.play().catch(() => {}));
    navigator.mediaSession.setActionHandler('pause', () => audio?.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      if (audio && audio.currentTime > 3) { audio.currentTime = 0; return; }
      const prev = currentIndex - 1;
      if (prev < 0 || playlist.length === 0) return;
      setCurrentIndex(prev);
      setCurrentTrack(playlist[prev]);
      setCurrentTime(0);
      setDuration(playlist[prev].duration ?? 0);
      if (audio) { audio.src = playlist[prev].url; audio.play().catch(() => {}); }
    });
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      const next = currentIndex + 1;
      if (next >= playlist.length) return;
      setCurrentIndex(next);
      setCurrentTrack(playlist[next]);
      setCurrentTime(0);
      setDuration(playlist[next].duration ?? 0);
      if (audio) { audio.src = playlist[next].url; audio.play().catch(() => {}); }
    });
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (audio && details.seekTime != null) audio.currentTime = details.seekTime;
    });

    return () => {
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('previoustrack', null);
      navigator.mediaSession.setActionHandler('nexttrack', null);
      navigator.mediaSession.setActionHandler('seekto', null);
    };
  }, [currentIndex, playlist]);

  // beforeunload warning when playing
  useEffect(() => {
    if (!currentTrack) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [currentTrack]);

  const playTrack = useCallback((track: AudioTrack) => {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrentTrack(track);
    setPlaylist([]);
    setCurrentIndex(0);
    setMinimized(false);
    setCurrentTime(0);
    setDuration(track.duration ?? 0);
    audio.src = track.url;
    audio.play().catch(() => {});
  }, []);

  const playPlaylist = useCallback((tracks: AudioTrack[], startIndex = 0) => {
    const audio = audioRef.current;
    if (!audio || tracks.length === 0) return;
    const idx = Math.max(0, Math.min(startIndex, tracks.length - 1));
    setPlaylist(tracks);
    setCurrentIndex(idx);
    setCurrentTrack(tracks[idx]);
    setMinimized(false);
    setCurrentTime(0);
    setDuration(tracks[idx].duration ?? 0);
    audio.src = tracks[idx].url;
    audio.play().catch(() => {});
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const resume = useCallback(() => {
    audioRef.current?.play().catch(() => {});
  }, []);

  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (audio) audio.currentTime = time;
  }, []);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolumeState(clamped);
    try { localStorage.setItem(VOLUME_KEY, String(clamped)); } catch { /* ignore */ }
  }, []);

  const nextTrack = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || playlist.length === 0) return;
    const next = currentIndex + 1;
    if (next >= playlist.length) return;
    setCurrentIndex(next);
    setCurrentTrack(playlist[next]);
    setCurrentTime(0);
    setDuration(playlist[next].duration ?? 0);
    audio.src = playlist[next].url;
    audio.play().catch(() => {});
  }, [playlist, currentIndex]);

  const prevTrack = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || playlist.length === 0) return;
    // If more than 3 seconds in, restart current track
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    const prev = currentIndex - 1;
    if (prev < 0) return;
    setCurrentIndex(prev);
    setCurrentTrack(playlist[prev]);
    setCurrentTime(0);
    setDuration(playlist[prev].duration ?? 0);
    audio.src = playlist[prev].url;
    audio.play().catch(() => {});
  }, [playlist, currentIndex]);

  const minimize = useCallback(() => setMinimized(true), []);

  const expand = useCallback(() => setMinimized(false), []);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = '';
    }
    setCurrentTrack(null);
    setPlaylist([]);
    setCurrentIndex(0);
    setMinimized(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, []);

  return (
    <AudioPlayerContext.Provider
      value={{
        currentTrack, playlist, currentIndex, minimized, isPlaying, currentTime, duration, volume,
        playTrack, playPlaylist, pause, resume, seek, setVolume, nextTrack, prevTrack, minimize, expand, stop,
      }}
    >
      {/* Hidden global audio element */}
      <audio ref={audioRef} preload="metadata" className="hidden" />
      {children}
    </AudioPlayerContext.Provider>
  );
}

export function useAudioPlayer(): AudioPlayerContextType {
  const ctx = useContext(AudioPlayerContext);
  if (!ctx) throw new Error('useAudioPlayer must be used within AudioPlayerProvider');
  return ctx;
}
