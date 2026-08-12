import { useRef, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';

import { AudioPlayerContext, type AudioTrack, type TrackLoadState } from '@/contexts/audioPlayerContextDef';
import { useAppContext } from '@/hooks/useAppContext';
import { getEffectiveBlossomServers } from '@/lib/appBlossom';
import { blossomAlternatives } from '@/lib/blossomFallback';
import {
  decryptFileToObjectUrl,
  FileTooLargeError,
  isSupportedEncryption,
} from '@/lib/encryptedFile';

const VOLUME_KEY = 'audio-player-volume';

const READY: TrackLoadState = { status: 'ready' };

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
  const [loadState, setLoadState] = useState<TrackLoadState>(READY);
  const [artworkSrc, setArtworkSrc] = useState<string | undefined>();

  const { config } = useAppContext();

  // Read through a ref so loading a track doesn't have to re-bind every time
  // the user's Blossom server list changes.
  const serversRef = useRef<string[]>([]);
  serversRef.current = getEffectiveBlossomServers(
    config.blossomServerMetadata,
    config.useAppBlossomServers,
  );

  /** Object URL backing the current track, if it had to be decrypted. */
  const objectUrlRef = useRef<string | undefined>(undefined);
  /** Identifies the newest load, so a slow decryption can't clobber a newer one. */
  const loadSeqRef = useRef(0);
  const abortRef = useRef<AbortController | undefined>(undefined);
  /** The track being loaded, so `decryptAnyway` knows what to retry. */
  const pendingTrackRef = useRef<AudioTrack | undefined>(undefined);

  const revokeObjectUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = undefined;
    }
  }, []);

  /**
   * Point the audio element at a track, decrypting it first when it's
   * encrypted.
   *
   * Encrypted media can't be streamed by the element — AES-GCM only
   * authenticates a complete message — so the whole file is fetched and
   * decrypted into an object URL before playback starts. The element is left
   * with no source in the meantime, and on failure it *stays* that way: the
   * track URL serves ciphertext, so falling back to it would hand the decoder
   * garbage.
   */
  const loadTrack = useCallback((track: AudioTrack, opts: { allowOversize?: boolean } = {}) => {
    const audio = audioRef.current;
    if (!audio) return;

    const seq = ++loadSeqRef.current;
    abortRef.current?.abort();
    abortRef.current = undefined;
    revokeObjectUrl();
    pendingTrackRef.current = track;

    if (!track.encryption) {
      setLoadState(READY);
      audio.src = track.url;
      audio.play().catch(() => {});
      return;
    }

    // Detach the previous source rather than leaving the old track loaded
    // under the new track's title.
    audio.pause();
    audio.removeAttribute('src');
    audio.load();

    if (!isSupportedEncryption(track.encryption)) {
      setLoadState({ status: 'unsupported' });
      return;
    }

    setLoadState({ status: 'decrypting' });

    const controller = new AbortController();
    abortRef.current = controller;

    decryptFileToObjectUrl(track.url, track.encryption, {
      signal: controller.signal,
      fallbackUrls: blossomAlternatives(track.url, serversRef.current),
      ...(opts.allowOversize ? { maxBytes: Number.POSITIVE_INFINITY } : {}),
    })
      .then(({ objectUrl }) => {
        if (seq !== loadSeqRef.current) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        objectUrlRef.current = objectUrl;
        setLoadState(READY);
        audio.src = objectUrl;
        // Decryption outlives the tap that started it, so a browser that wants
        // a fresh user gesture will refuse this. The track is loaded either
        // way, and the play button then starts it on the next tap.
        audio.play().catch(() => {});
      })
      .catch((e) => {
        if (seq !== loadSeqRef.current) return;
        if (e instanceof FileTooLargeError) setLoadState({ status: 'too-large', byteSize: e.byteSize });
        else if (!controller.signal.aborted) setLoadState({ status: 'failed' });
      });
  }, [revokeObjectUrl]);

  const decryptAnyway = useCallback(() => {
    const track = pendingTrackRef.current;
    if (track) loadTrack(track, { allowOversize: true });
  }, [loadTrack]);

  /** Switch to a playlist entry and start it. */
  const goToIndex = useCallback((idx: number) => {
    const track = playlist[idx];
    if (!track) return;
    setCurrentIndex(idx);
    setCurrentTrack(track);
    setCurrentTime(0);
    setDuration(track.duration ?? 0);
    loadTrack(track);
  }, [playlist, loadTrack]);

  // Decrypt the artwork of the current track, when it needs it. The `thumb`
  // travels under the same key as the audio but is its own blob.
  useEffect(() => {
    const artwork = currentTrack?.artwork;
    const encryption = currentTrack?.artworkEncryption;

    if (!artwork) {
      setArtworkSrc(undefined);
      return;
    }
    if (!encryption) {
      setArtworkSrc(artwork);
      return;
    }

    setArtworkSrc(undefined);
    if (!isSupportedEncryption(encryption)) return;

    let objectUrl: string | undefined;
    let cancelled = false;
    const controller = new AbortController();

    decryptFileToObjectUrl(artwork, encryption, {
      signal: controller.signal,
      fallbackUrls: blossomAlternatives(artwork, serversRef.current),
    })
      .then((result) => {
        if (cancelled) {
          URL.revokeObjectURL(result.objectUrl);
          return;
        }
        objectUrl = result.objectUrl;
        setArtworkSrc(result.objectUrl);
      })
      // Cover art is decoration: on failure the players fall back to their
      // placeholder icon rather than surfacing an error.
      .catch(() => {});

    return () => {
      cancelled = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [currentTrack?.artwork, currentTrack?.artworkEncryption]);

  // Release the decrypted track on unmount — nothing else revokes it.
  useEffect(() => () => {
    abortRef.current?.abort();
    revokeObjectUrl();
  }, [revokeObjectUrl]);

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
        goToIndex(currentIndex + 1);
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
  }, [playlist, currentIndex, goToIndex]);

  // Media Session API — populates Android/iOS notification panel with track info and controls
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    if (!currentTrack) {
      navigator.mediaSession.metadata = null;
      return;
    }
    // `artworkSrc` is an object URL for encrypted covers, so the OS panel gets
    // the decrypted image rather than a URL it can't make sense of.
    const artwork: MediaImage[] = artworkSrc
      ? [{ src: artworkSrc, sizes: '512x512' }]
      : [];
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artist,
      artwork,
    });
  }, [currentTrack, artworkSrc]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying]);

  // Keep OS scrubber position in sync
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    if (!currentTrack || duration <= 0) return;
    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate: audioRef.current?.playbackRate ?? 1,
        position: Math.min(currentTime, duration),
      });
    } catch { /* setPositionState may throw on some browsers */ }
  }, [currentTime, duration, currentTrack]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const audio = audioRef.current;

    navigator.mediaSession.setActionHandler('play', () => audio?.play().catch(() => {}));
    navigator.mediaSession.setActionHandler('pause', () => audio?.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      if (audio && audio.currentTime > 3) { audio.currentTime = 0; return; }
      if (playlist.length === 0) return;
      goToIndex(currentIndex - 1);
    });
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      goToIndex(currentIndex + 1);
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
  }, [currentIndex, playlist, goToIndex]);

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
    setCurrentTrack(track);
    setPlaylist([]);
    setCurrentIndex(0);
    setMinimized(false);
    setCurrentTime(0);
    setDuration(track.duration ?? 0);
    loadTrack(track);
  }, [loadTrack]);

  const playPlaylist = useCallback((tracks: AudioTrack[], startIndex = 0) => {
    if (tracks.length === 0) return;
    const idx = Math.max(0, Math.min(startIndex, tracks.length - 1));
    setPlaylist(tracks);
    setCurrentIndex(idx);
    setCurrentTrack(tracks[idx]);
    setMinimized(false);
    setCurrentTime(0);
    setDuration(tracks[idx].duration ?? 0);
    loadTrack(tracks[idx]);
  }, [loadTrack]);

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
    if (playlist.length === 0) return;
    goToIndex(currentIndex + 1);
  }, [playlist, currentIndex, goToIndex]);

  const prevTrack = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || playlist.length === 0) return;
    // If more than 3 seconds in, restart current track
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    goToIndex(currentIndex - 1);
  }, [playlist, currentIndex, goToIndex]);

  const minimize = useCallback(() => setMinimized(true), []);

  const expand = useCallback(() => setMinimized(false), []);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = '';
    }
    // Abandon any decryption in flight and hand back its memory.
    loadSeqRef.current++;
    abortRef.current?.abort();
    abortRef.current = undefined;
    pendingTrackRef.current = undefined;
    revokeObjectUrl();
    setLoadState(READY);
    setCurrentTrack(null);
    setPlaylist([]);
    setCurrentIndex(0);
    setMinimized(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, [revokeObjectUrl]);

  return (
    <AudioPlayerContext.Provider
      value={{
        currentTrack, playlist, currentIndex, minimized, isPlaying, currentTime, duration, volume,
        loadState, artworkSrc,
        playTrack, playPlaylist, pause, resume, seek, setVolume, nextTrack, prevTrack, minimize, expand, stop,
        decryptAnyway,
      }}
    >
      {/* Hidden global audio element */}
      <audio ref={audioRef} preload="metadata" className="hidden" />
      {children}
    </AudioPlayerContext.Provider>
  );
}


