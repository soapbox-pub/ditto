import { createContext, useContext } from 'react';

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
}

export type AudioPlayerContextType = AudioPlayerState & AudioPlayerActions;

export const AudioPlayerContext = createContext<AudioPlayerContextType | undefined>(undefined);

export function useAudioPlayer(): AudioPlayerContextType {
  const ctx = useContext(AudioPlayerContext);
  if (!ctx) throw new Error('useAudioPlayer must be used within AudioPlayerProvider');
  return ctx;
}
