// src/blobbi/actions/lib/blobbi-builtin-tracks.ts

/**
 * Built-in music tracks for the Play Music action.
 * 
 * PLACEHOLDER DATA - Replace with real tracks when available.
 * 
 * To replace these tracks:
 * 1. Place audio files in /public/audio/blobbi/ directory
 * 2. Update the `path` field to point to the new files
 * 3. Update metadata (title, artist, duration) as needed
 * 
 * Supported formats: MP3, WAV, OGG, M4A (browser-dependent)
 */

export interface BuiltInTrack {
  /** Unique identifier for the track */
  id: string;
  /** Display title */
  title: string;
  /** Artist or source attribution */
  artist: string;
  /** Path to the audio file (relative to public directory) */
  path: string;
  /** Duration in seconds (approximate, for display) */
  durationSeconds: number;
  /** Optional cover art path */
  coverArt?: string;
  /** Optional tags for categorization */
  tags?: string[];
}

/**
 * Built-in track catalog.
 * 
 * NOTE: These are placeholder entries. The audio files don't exist yet.
 * When real tracks are added, update the paths to point to actual files.
 */
export const BLOBBI_BUILTIN_TRACKS: BuiltInTrack[] = [
  {
    id: 'calm_meadow',
    title: 'Calm Meadow',
    artist: 'Blobbi Tunes',
    path: '/audio/blobbi/calm-meadow.mp3',
    durationSeconds: 120,
    tags: ['relaxing', 'nature'],
  },
  {
    id: 'happy_dance',
    title: 'Happy Dance',
    artist: 'Blobbi Tunes',
    path: '/audio/blobbi/happy-dance.mp3',
    durationSeconds: 90,
    tags: ['upbeat', 'fun'],
  },
  {
    id: 'sleepy_lullaby',
    title: 'Sleepy Lullaby',
    artist: 'Blobbi Tunes',
    path: '/audio/blobbi/sleepy-lullaby.mp3',
    durationSeconds: 180,
    tags: ['calming', 'sleep'],
  },
  {
    id: 'adventure_theme',
    title: 'Adventure Theme',
    artist: 'Blobbi Tunes',
    path: '/audio/blobbi/adventure-theme.mp3',
    durationSeconds: 150,
    tags: ['energetic', 'adventure'],
  },
  {
    id: 'cozy_fireplace',
    title: 'Cozy Fireplace',
    artist: 'Blobbi Tunes',
    path: '/audio/blobbi/cozy-fireplace.mp3',
    durationSeconds: 240,
    tags: ['ambient', 'relaxing'],
  },
];

/**
 * Get a built-in track by ID
 */
export function getBuiltInTrackById(id: string): BuiltInTrack | undefined {
  return BLOBBI_BUILTIN_TRACKS.find(track => track.id === id);
}

/**
 * Get all built-in tracks
 */
export function getAllBuiltInTracks(): BuiltInTrack[] {
  return BLOBBI_BUILTIN_TRACKS;
}

/**
 * Format duration in seconds to MM:SS string
 */
export function formatTrackDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
