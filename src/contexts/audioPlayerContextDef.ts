import { createContext, useContext } from 'react';

import type { FileEncryption } from '@/lib/encryptedFile';

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
  /** Present when `url` serves ciphertext that must be decrypted to play. */
  encryption?: FileEncryption;
  /** Artwork/cover image URL. */
  artwork?: string;
  /** Present when `artwork` serves ciphertext. */
  artworkEncryption?: FileEncryption;
  /** Duration in seconds (from metadata). */
  duration?: number;
  /** Navigation path to the track's detail page (e.g. /naddr1…). */
  path?: string;
}

/**
 * How far along the current track is in becoming playable.
 *
 * Only encrypted tracks are ever anything but `ready`: they have to be fetched
 * and decrypted in full before the `<audio>` element gets a source, and that
 * can fail in ways the UI has to explain rather than silently doing nothing.
 */
export type TrackLoadState =
  | { status: 'ready' }
  | { status: 'decrypting' }
  /** Fetch, decryption, or the `ox` hash check failed. */
  | { status: 'failed' }
  /** Encrypted with an algorithm this client doesn't implement. */
  | { status: 'unsupported' }
  /** Past the size cap; `decryptAnyway()` overrides. */
  | { status: 'too-large'; byteSize: number };

export interface AudioPlayerState {
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
  /** Whether the current track is playable yet, and why not when it isn't. */
  loadState: TrackLoadState;
  /**
   * What to feed an `<img>` for the current track's artwork: the URL itself
   * when it isn't encrypted, an object URL once decrypted, `undefined` while
   * decrypting or after a failure.
   */
  artworkSrc: string | undefined;
}

export interface AudioPlayerActions {
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
  /**
   * Decrypt the current track despite the size cap. Only meaningful while
   * `loadState.status` is `too-large`.
   */
  decryptAnyway: () => void;
}

export type AudioPlayerContextType = AudioPlayerState & AudioPlayerActions;

export const AudioPlayerContext = createContext<AudioPlayerContextType | undefined>(undefined);

export function useAudioPlayer(): AudioPlayerContextType {
  const ctx = useContext(AudioPlayerContext);
  if (!ctx) throw new Error('useAudioPlayer must be used within AudioPlayerProvider');
  return ctx;
}
