// src/blobbi/actions/lib/blobbi-builtin-tracks.ts

/**
 * Built-in music tracks for the Blobbi "Play Music" action.
 * 
 * ## Asset Location
 * 
 * Audio files live in: `public/blobbi/audio/`
 * 
 * In Vite, files in `public/` are served at root paths, so:
 * - `public/blobbi/audio/foo.mp3` → accessible at `/blobbi/audio/foo.mp3`
 * 
 * ## Adding New Tracks
 * 
 * 1. Place the MP3 file in `public/blobbi/audio/`
 * 2. Add a new entry to `BLOBBI_BUILTIN_TRACKS` below
 * 3. Set `path` to `/blobbi/audio/<filename>.mp3`
 * 4. Get the duration: `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 <file>`
 * 
 * ## Supported Formats
 * 
 * MP3 is recommended for maximum browser compatibility.
 * WAV, OGG, and M4A may work but are browser-dependent.
 */

export interface BuiltInTrack {
  /** Unique identifier for the track (used in state/events) */
  id: string;
  /** Display title shown in the UI */
  title: string;
  /** Artist or source attribution */
  artist: string;
  /** Path to audio file (relative to public directory root) */
  path: string;
  /** Duration in seconds (for display, get via ffprobe) */
  durationSeconds: number;
  /** Optional cover art path (relative to public directory root) */
  coverArt?: string;
  /** Optional tags for categorization/filtering */
  tags?: string[];
}

/**
 * Built-in track catalog for Blobbi music player.
 * 
 * All tracks are royalty-free/Creative Commons licensed.
 * Audio files located at: public/blobbi/audio/
 */
export const BLOBBI_BUILTIN_TRACKS: BuiltInTrack[] = [
  {
    id: 'nap_in_the_meadow',
    title: 'Nap in the Meadow',
    artist: 'Chilltape FM',
    path: '/blobbi/audio/chilltapefm-nap-in-the-meadow.mp3',
    durationSeconds: 240, // 4:00
    tags: ['relaxing', 'nature'],
  },
  {
    id: 'happy_kids',
    title: 'Happy Kids',
    artist: 'Dmitrii Kolesnikov',
    path: '/blobbi/audio/happy-kids.mp3',
    durationSeconds: 129, // 2:09
    tags: ['upbeat', 'fun'],
  },
  {
    id: 'soft_piano',
    title: 'Soft Piano',
    artist: 'Dmitrii Kolesnikov',
    path: '/blobbi/audio/soft-piano.mp3',
    durationSeconds: 124, // 2:04
    tags: ['calming', 'sleep'],
  },
  {
    id: 'epic_sacred_light',
    title: 'Epic Sacred Light',
    artist: 'Ura Megis',
    path: '/blobbi/audio/epic-sacred-light.mp3',
    durationSeconds: 223, // 3:43
    tags: ['energetic', 'adventure'],
  },
  {
    id: 'split_memmories',
    title: 'Split Memmories',
    artist: 'ido berg',
    path: '/blobbi/audio/split-memmories.mp3',
    durationSeconds: 153, // 2:33
    tags: ['ambient', 'relaxing'],
  },
  {
    id: 'minhas_mensagens',
    title: 'Minhas Mensagens',
    artist: 'PReis',
    path: '/blobbi/audio/minhas-mensagens-preis.mp3',
    durationSeconds: 248, // 4:08
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
